import type { Task } from '@shared/core';
type ProgressTask = Pick<Task, 'status' | 'subtaskCount' | 'subtasksDone'>;
/** Count leaf work once: a standalone task, or its subtasks, never both. */
export function progressFor(task: ProgressTask) {
  const total = Math.max(1, task.subtaskCount);
  const done = task.subtaskCount ? task.subtasksDone : task.status === 'done' ? 1 : 0;
  return { done, total, percent: Math.round((done / total) * 100) };
}
export function summarizeLists(tasks: ProgressTask[]) {
  const counts = tasks.map(progressFor);
  const done = counts.reduce((n, p) => n + p.done, 0),
    total = counts.reduce((n, p) => n + p.total, 0);
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    listsDone: counts.filter((p) => p.done === p.total).length,
    listsTotal: tasks.length,
  };
}
