/**
 * Achievement definitions (PLAN §10). This is the only place they are written (CLAUDE.md rule 3);
 * the database stores just which ones were unlocked and when.
 */
export interface AchievementStats {
  /** Every task ever made, including deleted ones. */
  tasksEver: number;
  /** Days whose inbox was cleared and still counts. */
  inboxZeroDays: number;
  frogsEaten: number;
  /** Today has tasks due and every one of them is done. */
  cleanSweepToday: boolean;
  longestFocusMinutes: number;
  maintenanceDone: number;
  /** Units (from the WorkWork bridge) whose every task is done. */
  unitsClosed: number;
  activeDaysLast7: number;
  shutdowns: number;
  level: number;
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  unlocked(stats: AchievementStats): boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    key: 'first-capture',
    title: 'First Capture',
    description: 'Get your first task out of your head.',
    unlocked: (s) => s.tasksEver >= 1,
  },
  {
    key: 'inbox-zero',
    title: 'Inbox Zero',
    description: 'Empty the inbox.',
    unlocked: (s) => s.inboxZeroDays >= 1,
  },
  {
    key: 'frog-eater',
    title: 'Frog Eater',
    description: 'Finish 5 tasks you had put off twice or more.',
    unlocked: (s) => s.frogsEaten >= 5,
  },
  {
    key: 'clean-sweep',
    title: 'Clean Sweep',
    description: 'Finish every task due today.',
    unlocked: (s) => s.cleanSweepToday,
  },
  {
    key: 'deep-work',
    title: 'Deep Work',
    description: 'Complete a 45-minute focus session.',
    unlocked: (s) => s.longestFocusMinutes >= 45,
  },
  {
    key: 'homekeeper',
    title: 'Homekeeper',
    description: 'Mark 5 maintenance items done.',
    unlocked: (s) => s.maintenanceDone >= 5,
  },
  {
    key: 'unit-closer',
    title: 'Unit Closer',
    description: 'Finish every task in one unit.',
    unlocked: (s) => s.unitsClosed >= 1,
  },
  {
    key: 'week-warrior',
    title: 'Week Warrior',
    description: 'Be active all 7 of the last 7 days.',
    unlocked: (s) => s.activeDaysLast7 >= 7,
  },
  {
    key: 'shutdown-habit',
    title: 'Shutdown Habit',
    description: 'Complete the shutdown ritual 5 times.',
    unlocked: (s) => s.shutdowns >= 5,
  },
  {
    key: 'level-5',
    title: 'Level 5',
    description: 'Reach level 5.',
    unlocked: (s) => s.level >= 5,
  },
  {
    key: 'level-10',
    title: 'Level 10',
    description: 'Reach level 10.',
    unlocked: (s) => s.level >= 10,
  },
];

export const achievementByKey = (key: string): AchievementDef | undefined =>
  ACHIEVEMENTS.find((a) => a.key === key);
