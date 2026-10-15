import { describe, expect, it } from 'vitest';
import { progressFor, summarizeLists } from '../../src/renderer/lib/list-progress';

describe('Pulse task progress', () => {
  it('counts the actual steps rather than averaging different-sized list percentages', () => {
    const result = summarizeLists([
      { status: 'todo', subtaskCount: 4, subtasksDone: 1 },
      { status: 'todo', subtaskCount: 1, subtasksDone: 1 },
    ]);
    expect(result).toEqual({ done: 2, total: 5, percent: 40, listsDone: 1, listsTotal: 2 });
  });
  it('includes standalone tasks and keeps an empty workspace at zero', () => {
    expect(summarizeLists([])).toEqual({
      done: 0,
      total: 0,
      percent: 0,
      listsDone: 0,
      listsTotal: 0,
    });
    expect(progressFor({ status: 'todo', subtaskCount: 0, subtasksDone: 0 })).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
    expect(progressFor({ status: 'done', subtaskCount: 0, subtasksDone: 0 })).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
  });
  it('reopening a child lowers progress even if the parent had been completed', () => {
    expect(progressFor({ status: 'done', subtaskCount: 3, subtasksDone: 2 })).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });
});
