import { describe, expect, it } from 'vitest';
import { dryLine } from '../../src/renderer/lib/format';

const day = (over: Partial<Parameters<typeof dryLine>[0]> = {}) => ({
  phase: 'during' as const,
  dueToday: [],
  doneToday: 0,
  carriedForward: 0,
  ...over,
});

describe('dryLine: one calm sentence about the day', () => {
  it('a clear page invites the first thing, or none', () => {
    expect(dryLine(day())).toBe('A clear page. Add the first thing, or leave it clear.');
  });

  it('names the big one among several', () => {
    const line = dryLine(
      day({
        dueToday: [
          { title: 'Print the quiz', size: 's' },
          { title: 'Grade lab reports', size: 'l' },
          { title: 'Email parents', size: 's' },
        ],
      }),
    );
    expect(line).toBe('3 left today. Grade lab reports is the big one.');
  });

  it('says so when nothing is large, and when only one thing is left', () => {
    expect(
      dryLine(
        day({
          dueToday: [
            { title: 'A', size: 's' },
            { title: 'B', size: 'm' },
          ],
        }),
      ),
    ).toBe('2 left today. None of them is large.');
    expect(dryLine(day({ dueToday: [{ title: 'Print the quiz', size: 's' }] }))).toBe(
      'One thing left: Print the quiz.',
    );
  });

  it('closes the day plainly, and never gushes or guilt-trips', () => {
    expect(dryLine(day({ phase: 'after', doneToday: 4 }))).toBe(
      'That is the day. Anything left can wait.',
    );
    expect(dryLine(day({ doneToday: 2 }))).toBe('Everything dated today is done.');
    const slipped = dryLine(day({ carriedForward: 3, dueToday: [{ title: 'X', size: 's' }] }));
    expect(slipped).toContain('3 still on deck from earlier.');
    for (const line of [slipped, dryLine(day()), dryLine(day({ phase: 'after' }))]) {
      expect(line).not.toMatch(/!|overdue|behind|should/i);
    }
  });
});
