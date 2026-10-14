import { describe, expect, it } from 'vitest';
import {
  focusXp,
  isFrog,
  levelFor,
  streakWindow,
  taskXp,
  xpForLevel,
} from '../../src/main/domain/xp';
import { ACHIEVEMENTS } from '../../src/main/domain/achievements';
import type { AchievementStats } from '../../src/main/domain/achievements';

describe('task XP', () => {
  it('is 10, 20 and 40 by size', () => {
    expect(taskXp('s', 0)).toBe(10);
    expect(taskXp('m', 0)).toBe(20);
    expect(taskXp('l', 0)).toBe(40);
  });

  it('adds 50% for a frog: put off twice or more', () => {
    expect(isFrog(1)).toBe(false);
    expect(isFrog(2)).toBe(true);
    expect(taskXp('s', 1)).toBe(10);
    expect(taskXp('s', 2)).toBe(15);
    expect(taskXp('m', 5)).toBe(30);
    expect(taskXp('l', 2)).toBe(60);
  });
});

describe('focus XP', () => {
  it('is one point for each full five minutes', () => {
    expect(focusXp(0)).toBe(0);
    expect(focusXp(4)).toBe(0);
    expect(focusXp(5)).toBe(1);
    expect(focusXp(24)).toBe(4);
    expect(focusXp(25)).toBe(5);
    expect(focusXp(45)).toBe(9);
  });
});

describe('levels', () => {
  it('level n needs 50 × n × (n + 1) XP', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(300);
    expect(xpForLevel(3)).toBe(600);
    expect(xpForLevel(5)).toBe(1500);
    expect(xpForLevel(10)).toBe(5500);
  });

  it('finds the level and the progress toward the next', () => {
    expect(levelFor(0)).toMatchObject({ level: 0, xpIntoLevel: 0, xpForNext: 100, progress: 0 });
    expect(levelFor(99).level).toBe(0);
    expect(levelFor(100)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 200 });
    expect(levelFor(299).level).toBe(1);
    expect(levelFor(300).level).toBe(2);
    expect(levelFor(450)).toMatchObject({
      level: 2,
      xpIntoLevel: 150,
      xpForNext: 300,
      progress: 0.5,
    });
    expect(levelFor(5500).level).toBe(10);
  });

  it('never goes below zero', () => {
    expect(levelFor(-50).level).toBe(0);
  });
});

describe('the streak: active days in the last 7', () => {
  const today = '2026-10-14';
  const wins = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it('counts a day as active with 3 or more wins', () => {
    const w = streakWindow(wins({ '2026-10-14': 3, '2026-10-13': 2, '2026-10-12': 5 }), today);
    expect(w.active).toBe(2);
    expect(w.of).toBe(7);
    expect(w.days.map((d) => d.date)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
  });

  it('never drops to zero because of one missed day', () => {
    const everyDay = Object.fromEntries(
      ['08', '09', '10', '11', '12', '13', '14'].map((d) => [`2026-10-${d}`, 4]),
    );
    expect(streakWindow(wins(everyDay), today).active).toBe(7);
    // Miss yesterday: it costs one day, not the streak.
    expect(streakWindow(wins({ ...everyDay, '2026-10-13': 0 }), today).active).toBe(6);
    // Miss today too, with the week before still counting.
    expect(
      streakWindow(wins({ ...everyDay, '2026-10-13': 0, '2026-10-14': 0 }), today).active,
    ).toBe(5);
  });

  it('only looks at the last seven days, across a month end', () => {
    const w = streakWindow(wins({ '2026-10-31': 3, '2026-10-24': 9 }), '2026-11-02');
    expect(w.days[0]?.date).toBe('2026-10-27');
    expect(w.active).toBe(1);
  });
});

describe('achievements', () => {
  const none: AchievementStats = {
    tasksEver: 0,
    inboxZeroDays: 0,
    frogsEaten: 0,
    cleanSweepToday: false,
    longestFocusMinutes: 0,
    maintenanceDone: 0,
    unitsClosed: 0,
    activeDaysLast7: 0,
    shutdowns: 0,
    level: 0,
  };
  const unlockedBy = (stats: Partial<AchievementStats>) =>
    ACHIEVEMENTS.filter((a) => a.unlocked({ ...none, ...stats })).map((a) => a.key);

  it('has the starting set, each with a unique key', () => {
    expect(ACHIEVEMENTS.map((a) => a.title)).toEqual([
      'First Capture',
      'Inbox Zero',
      'Frog Eater',
      'Clean Sweep',
      'Deep Work',
      'Homekeeper',
      'Unit Closer',
      'Week Warrior',
      'Shutdown Habit',
      'Level 5',
      'Level 10',
    ]);
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });

  it('unlocks nothing from nothing', () => {
    expect(unlockedBy({})).toEqual([]);
  });

  it('applies each threshold', () => {
    expect(unlockedBy({ tasksEver: 1 })).toEqual(['first-capture']);
    expect(unlockedBy({ inboxZeroDays: 1 })).toEqual(['inbox-zero']);
    expect(unlockedBy({ frogsEaten: 4 })).toEqual([]);
    expect(unlockedBy({ frogsEaten: 5 })).toEqual(['frog-eater']);
    expect(unlockedBy({ cleanSweepToday: true })).toEqual(['clean-sweep']);
    expect(unlockedBy({ longestFocusMinutes: 44 })).toEqual([]);
    expect(unlockedBy({ longestFocusMinutes: 45 })).toEqual(['deep-work']);
    expect(unlockedBy({ maintenanceDone: 5 })).toEqual(['homekeeper']);
    expect(unlockedBy({ unitsClosed: 1 })).toEqual(['unit-closer']);
    expect(unlockedBy({ activeDaysLast7: 6 })).toEqual([]);
    expect(unlockedBy({ activeDaysLast7: 7 })).toEqual(['week-warrior']);
    expect(unlockedBy({ shutdowns: 5 })).toEqual(['shutdown-habit']);
    expect(unlockedBy({ level: 5 })).toEqual(['level-5']);
    expect(unlockedBy({ level: 10 })).toEqual(['level-5', 'level-10']);
  });
});
