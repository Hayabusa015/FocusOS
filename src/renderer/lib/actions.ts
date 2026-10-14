import type { Task } from '@shared/core';

/** Ticking a checkbox: finish the task, or bring a finished one back. */
export async function toggleTask(task: Task): Promise<void> {
  if (task.status === 'done') await window.cortex.tasks.reopen(task.id);
  else await window.cortex.tasks.complete(task.id);
}
