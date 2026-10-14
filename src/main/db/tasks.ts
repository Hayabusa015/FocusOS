import {
  addDays,
  isoToLocalDate,
  isoToLocalTime,
  localToIso,
  parseLocalDate,
  startOfWeek,
} from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import { Recurrence } from '@shared/core';
import type { Block, Task, TaskCreate, TaskFilter, TaskUpdate } from '@shared/core';
import { describeRecurrence, nextDueAfterCompletion } from '../domain/recurrence';
import { all, int, intOrNull, mutate, one, run, str, strOrNull } from './context';
import type { Ctx, Mutation, Row } from './context';
import { getArea } from './areas';

const SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL) AS subtask_count,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL
       AND c.status = 'done') AS subtasks_done
  FROM tasks t`;

const OPEN = `('inbox', 'todo', 'doing')`;

function parseRecurrence(raw: string | null): Recurrence | null {
  if (!raw) return null;
  try {
    const parsed = Recurrence.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function toTask(r: Row): Task {
  const recurrence = parseRecurrence(strOrNull(r, 'recurrence'));
  return {
    id: str(r, 'id'),
    title: str(r, 'title'),
    notes: strOrNull(r, 'notes'),
    areaId: strOrNull(r, 'area_id'),
    parentId: strOrNull(r, 'parent_id'),
    status: str(r, 'status') as Task['status'],
    dueDate: strOrNull(r, 'due_date'),
    dueTime: strOrNull(r, 'due_time'),
    scheduledStart: strOrNull(r, 'scheduled_start'),
    scheduledMinutes: intOrNull(r, 'scheduled_minutes'),
    size: str(r, 'size') as Task['size'],
    unitCode: strOrNull(r, 'unit_code'),
    notePath: strOrNull(r, 'note_path'),
    recurrence,
    recurrenceText: recurrence ? describeRecurrence(recurrence) : null,
    deferCount: int(r, 'defer_count'),
    source: str(r, 'source') as Task['source'],
    completedAt: strOrNull(r, 'completed_at'),
    createdAt: str(r, 'created_at'),
    sortOrder: int(r, 'sort_order'),
    subtaskCount: int(r, 'subtask_count'),
    subtasksDone: int(r, 'subtasks_done'),
  };
}

export function getTask(ctx: Ctx, id: string): Task | null {
  const r = one(ctx, `${SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`, id);
  return r ? toTask(r) : null;
}

export function listSubtasks(ctx: Ctx, parentId: string): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.parent_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.created_at, t.id`,
    parentId,
  ).map(toTask);
}

/** One step past the highest manual order, so a new task goes to the end of every list. */
function nextSortOrder(ctx: Ctx): number {
  const r = one(ctx, 'SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks');
  return Number(r?.['m'] ?? 0) + 10;
}

function must(ctx: Ctx, id: string): Task {
  const task = getTask(ctx, id);
  if (!task) throw new Error('That task no longer exists');
  return task;
}

const quote = (title: string) => `"${title}"`;
const prettyDate = (date: LocalDate) => {
  const { y, m, d } = parseLocalDate(date);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

function blockColumns(block: Block | null): { start: string | null; minutes: number | null } {
  return block
    ? { start: localToIso(block.date, block.time), minutes: block.minutes }
    : { start: null, minutes: null };
}

/** Moves a time block to another day, keeping its time of day. */
function shiftBlock(start: string | null, toDate: LocalDate): string | null {
  return start ? localToIso(toDate, isoToLocalTime(start)) : null;
}

function assertSane(recurrence: Recurrence | null, dueDate: string | null): void {
  if (recurrence && !dueDate) throw new Error('A repeating task needs a due date');
}

export function createTask(
  ctx: Ctx,
  input: TaskCreate,
  actor: 'user' | 'atlas' = 'user',
  source: Task['source'] = 'manual',
): Mutation<Task> {
  if (input.status === 'done') throw new Error('A new task cannot start out finished');
  let areaId = input.areaId ?? null;
  if (input.parentId) {
    const parent = getTask(ctx, input.parentId);
    if (!parent) throw new Error('The parent task no longer exists');
    if (parent.parentId) throw new Error('Subtasks go one level deep only');
    areaId = areaId ?? parent.areaId;
  }
  if (areaId && !getArea(ctx, areaId)) throw new Error('That area does not exist');
  const recurrence = input.recurrence ?? null;
  const dueDate = input.dueDate ?? null;
  assertSane(recurrence, dueDate);
  const status = input.status ?? (areaId || input.parentId ? 'todo' : 'inbox');
  const block = blockColumns(input.block ?? null);

  return mutate(ctx, actor, 'task.create', (tx) => {
    const id = ctx.newId();
    const stamp = ctx.nowIso();
    run(
      ctx,
      `INSERT INTO tasks (id, title, notes, area_id, parent_id, status, due_date, due_time,
         scheduled_start, scheduled_minutes, size, recurrence, source, created_at, updated_at,
         sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.title,
      input.notes ?? null,
      areaId,
      input.parentId ?? null,
      status,
      dueDate,
      input.dueTime ?? null,
      block.start,
      block.minutes,
      input.size ?? 's',
      recurrence ? JSON.stringify(recurrence) : null,
      source,
      stamp,
      stamp,
      nextSortOrder(ctx),
    );
    tx.created('tasks', id);
    return { result: must(ctx, id), summary: `Added ${quote(input.title)}` };
  });
}

export function updateTask(
  ctx: Ctx,
  patch: TaskUpdate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<Task> {
  const t = must(ctx, patch.id);
  if (patch.status === 'done') throw new Error('Finish a task with Complete, not by editing it');
  if (patch.areaId && !getArea(ctx, patch.areaId)) throw new Error('That area does not exist');

  const has = <K extends keyof TaskUpdate>(k: K) => patch[k] !== undefined;
  let areaId = has('areaId') ? (patch.areaId ?? null) : t.areaId;
  const dueDate = has('dueDate') ? (patch.dueDate ?? null) : t.dueDate;
  const recurrence = has('recurrence') ? (patch.recurrence ?? null) : t.recurrence;
  assertSane(recurrence, dueDate);

  // Giving an unsorted task an area sorts it, unless the status was set explicitly.
  let status = patch.status ?? t.status;
  if (!has('status') && has('areaId') && areaId && t.status === 'inbox') status = 'todo';
  if (!has('status') && has('areaId') && !areaId && t.status === 'todo' && !t.parentId)
    status = 'inbox';

  // Indent (make it a step of another task) or outdent (make it a task again). One level only.
  let parentId = t.parentId;
  let sortOrder: number | null = null;
  if (has('parentId') && (patch.parentId ?? null) !== t.parentId) {
    parentId = patch.parentId ?? null;
    if (parentId) {
      const parent = getTask(ctx, parentId);
      if (!parent) throw new Error('The parent task no longer exists');
      if (parent.id === t.id) throw new Error('A task cannot be a step of itself');
      if (parent.parentId) throw new Error('Steps go one level deep only');
      if (t.subtaskCount > 0) throw new Error('Move its steps out first: steps go one level deep');
      const last = one(
        ctx,
        'SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks WHERE parent_id = ? AND deleted_at IS NULL',
        parentId,
      );
      sortOrder = Math.max(Number(last?.['m'] ?? 0), parent.sortOrder) + 1;
      if (!has('areaId') && !areaId) areaId = parent.areaId;
      if (!has('status') && status === 'inbox') status = 'todo';
    } else {
      // Back out to the main list, right after the task it came from.
      const former = t.parentId ? getTask(ctx, t.parentId) : null;
      sortOrder = (former?.sortOrder ?? nextSortOrder(ctx)) + 1;
    }
  }

  // A time block: set, cleared, or carried along when the due date moves.
  let start = t.scheduledStart;
  let minutes = t.scheduledMinutes;
  if (has('block')) {
    const b = blockColumns(patch.block ?? null);
    start = b.start;
    minutes = b.minutes;
  } else if (
    has('dueDate') &&
    dueDate &&
    t.scheduledStart &&
    (dueDate !== t.dueDate || isoToLocalDate(t.scheduledStart) !== dueDate)
  ) {
    // The block goes along with the date, even if the date was already that day and the block
    // was on another (a block today for a task due tomorrow).
    start = shiftBlock(t.scheduledStart, dueDate);
  }

  // Pushing a due date to a later day counts as a deferral, which Atlas and the XP rules use.
  // Bringing a slipped task forward to today is not a deferral; pushing it past today is.
  const deferred =
    has('dueDate') && t.dueDate && dueDate && dueDate > t.dueDate && dueDate > ctx.today();

  const only = (...keys: (keyof TaskUpdate)[]) =>
    Object.keys(patch).every((k) => k === 'id' || keys.includes(k as keyof TaskUpdate));
  let summary = `Updated ${quote(t.title)}`;
  if (only('status') && status === 'someday') summary = `Moved ${quote(t.title)} to Someday`;
  else if (only('dueDate') && dueDate)
    summary = `Moved ${quote(t.title)} to ${prettyDate(dueDate)}`;
  else if (only('parentId') && parentId)
    summary = `Made ${quote(t.title)} a step of ${quote(getTask(ctx, parentId)?.title ?? 'a task')}`;
  else if (only('parentId') && !parentId) summary = `Moved ${quote(t.title)} out to the main list`;
  else if (only('areaId') && areaId) {
    summary = `Sorted ${quote(t.title)} into ${getArea(ctx, areaId)?.name ?? 'an area'}`;
  }

  return mutate(ctx, actor, 'task.update', (tx) => {
    tx.before('tasks', t.id);
    run(
      ctx,
      `UPDATE tasks SET title = ?, notes = ?, area_id = ?, status = ?, due_date = ?, due_time = ?,
         scheduled_start = ?, scheduled_minutes = ?, size = ?, recurrence = ?, defer_count = ?,
         completed_at = ?, parent_id = ?, sort_order = COALESCE(?, sort_order), updated_at = ?
       WHERE id = ?`,
      patch.title ?? t.title,
      has('notes') ? (patch.notes ?? null) : t.notes,
      areaId,
      status,
      dueDate,
      has('dueTime') ? (patch.dueTime ?? null) : t.dueTime,
      start,
      minutes,
      patch.size ?? t.size,
      recurrence ? JSON.stringify(recurrence) : null,
      t.deferCount + (deferred ? 1 : 0),
      t.completedAt,
      parentId,
      sortOrder,
      ctx.nowIso(),
      t.id,
    );
    return { result: must(ctx, t.id), summary };
  });
}

export interface CompleteResult {
  task: Task;
  /** The next instance, when the finished task repeats. */
  next: Task | null;
}

export function completeTask(
  ctx: Ctx,
  id: string,
  actor: 'user' | 'atlas' = 'user',
): Mutation<CompleteResult> {
  const t = must(ctx, id);
  if (t.status === 'done') return { result: { task: t, next: null }, logId: '', summary: '' };

  return mutate(ctx, actor, 'task.complete', (tx) => {
    const stamp = ctx.nowIso();
    tx.before('tasks', id);
    run(
      ctx,
      `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
      stamp,
      stamp,
      id,
    );
    // Finishing a task finishes its open subtasks too.
    for (const sub of listSubtasks(ctx, id).filter((s) => s.status !== 'done')) {
      tx.before('tasks', sub.id);
      run(
        ctx,
        `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
        stamp,
        stamp,
        sub.id,
      );
    }

    let next: Task | null = null;
    let summary = `Completed ${quote(t.title)}`;
    if (t.recurrence && t.dueDate) {
      const dueDate = nextDueAfterCompletion(t.recurrence, t.dueDate, ctx.today());
      const nextId = ctx.newId();
      run(
        ctx,
        `INSERT INTO tasks (id, title, notes, area_id, status, due_date, due_time, scheduled_start,
           scheduled_minutes, size, unit_code, note_path, recurrence, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        nextId,
        t.title,
        t.notes,
        t.areaId,
        dueDate,
        t.dueTime,
        shiftBlock(t.scheduledStart, dueDate),
        t.scheduledMinutes,
        t.size,
        t.unitCode,
        t.notePath,
        JSON.stringify(t.recurrence),
        t.source,
        stamp,
        stamp,
      );
      tx.created('tasks', nextId);
      next = must(ctx, nextId);
      summary += `. The next one is due ${prettyDate(dueDate)}`;
    }
    return { result: { task: must(ctx, id), next }, summary };
  });
}

export function reopenTask(ctx: Ctx, id: string, actor: 'user' | 'atlas' = 'user'): Mutation<Task> {
  const t = must(ctx, id);
  return mutate(ctx, actor, 'task.reopen', (tx) => {
    tx.before('tasks', id);
    run(
      ctx,
      `UPDATE tasks SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?`,
      t.areaId || t.parentId ? 'todo' : 'inbox',
      ctx.nowIso(),
      id,
    );
    return { result: must(ctx, id), summary: `Reopened ${quote(t.title)}` };
  });
}

export function deleteTask(ctx: Ctx, id: string, actor: 'user' | 'atlas' = 'user'): Mutation<void> {
  const t = must(ctx, id);
  return mutate(ctx, actor, 'task.delete', (tx) => {
    const stamp = ctx.nowIso();
    for (const targetId of [id, ...listSubtasks(ctx, id).map((s) => s.id)]) {
      tx.before('tasks', targetId);
      run(
        ctx,
        'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?',
        stamp,
        stamp,
        targetId,
      );
    }
    return { result: undefined, summary: `Deleted ${quote(t.title)}` };
  });
}

/** "Not today": moves the due date, and any time block, to another day. */
export function rescheduleTask(
  ctx: Ctx,
  id: string,
  dueDate: LocalDate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<Task> {
  return updateTask(ctx, { id, dueDate }, actor);
}

export function listTasks(ctx: Ctx, filter: TaskFilter): Task[] {
  const base = `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL`;
  const weekStart = localToIso(startOfWeek(ctx.today()), '00:00');
  const byDueThenNew =
    'ORDER BY t.sort_order, t.due_date IS NULL, t.due_date, t.due_time IS NULL, t.due_time, t.created_at, t.id';
  switch (filter.view) {
    case 'inbox':
      return all(
        ctx,
        `${base} AND t.area_id IS NULL AND t.status IN ${OPEN} ORDER BY t.sort_order, t.created_at, t.id`,
      ).map(toTask);
    case 'someday':
      return all(ctx, `${base} AND t.status = 'someday' ORDER BY t.created_at DESC, t.id DESC`).map(
        toTask,
      );
    case 'done-this-week':
      return all(
        ctx,
        `${base} AND t.status = 'done' AND t.completed_at >= ? ORDER BY t.completed_at DESC`,
        weekStart,
      ).map(toTask);
    case 'area':
      if (!filter.areaId) throw new Error('An area is needed');
      return all(
        ctx,
        `${base} AND t.area_id = ? AND (t.status IN ${OPEN} OR (t.status = 'done' AND t.completed_at >= ?)) ${byDueThenNew}`,
        filter.areaId,
        weekStart,
      ).map(toTask);
  }
}

/**
 * Puts tasks in the order given (a drag). The tasks swap their existing order numbers among
 * themselves, so anything else in the list stays exactly where it was.
 */
export function reorderTasks(
  ctx: Ctx,
  ids: string[],
  actor: 'user' | 'atlas' = 'user',
): Mutation<void> {
  const tasks = ids.map((id) => must(ctx, id));
  if (new Set(ids).size !== ids.length) throw new Error('Each task can be listed once');
  const slots = tasks.map((t) => t.sortOrder).sort((a, b) => a - b);
  const changes = tasks.filter((t, i) => t.sortOrder !== slots[i]);
  if (changes.length === 0) return { result: undefined, logId: '', summary: '' };
  return mutate(ctx, actor, 'task.reorder', (tx) => {
    const stamp = ctx.nowIso();
    tasks.forEach((t, i) => {
      const slot = slots[i] as number;
      if (t.sortOrder === slot) return;
      tx.before('tasks', t.id);
      run(ctx, 'UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?', slot, stamp, t.id);
    });
    return { result: undefined, summary: `Reordered ${tasks.length} tasks` };
  });
}

/** The steps of each given task, in one read. */
export function listChildren(ctx: Ctx, parentIds: string[]): Record<string, Task[]> {
  const out: Record<string, Task[]> = {};
  for (const id of parentIds) out[id] = listSubtasks(ctx, id);
  return out;
}

/** Top-level tasks finished on `date`, newest first. */
export function listCompletedOn(ctx: Ctx, date: LocalDate): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.status = 'done'
       AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at DESC, t.id`,
    localToIso(date, '00:00'),
    localToIso(addDays(date, 1), '00:00'),
  ).map(toTask);
}

/** Open, top-level tasks due on `date`. */
export function listDueOn(ctx: Ctx, date: LocalDate): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.status IN ${OPEN} AND t.due_date = ?
     ORDER BY t.sort_order, t.due_time IS NULL, t.due_time, t.created_at, t.id`,
    date,
  ).map(toTask);
}

/** Open tasks with no date, in manual order, for the morning briefing's "pick your first thing". */
export function listUndatedOpen(ctx: Ctx, limit: number): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.due_date IS NULL
       AND t.area_id IS NOT NULL AND t.status IN ('todo', 'doing')
     ORDER BY t.sort_order, t.created_at, t.id LIMIT ?`,
    limit,
  ).map(toTask);
}

/** Open tasks whose day has passed. The Today page calls these "carry forward", never overdue. */
export function listCarryForward(ctx: Ctx, today: LocalDate): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.status IN ${OPEN} AND t.due_date < ?
     ORDER BY t.due_date, t.due_time IS NULL, t.due_time, t.created_at, t.id`,
    today,
  ).map(toTask);
}

export function listDueBetween(ctx: Ctx, from: LocalDate, to: LocalDate): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.status IN ${OPEN}
       AND t.due_date >= ? AND t.due_date <= ?
     ORDER BY t.due_date, t.due_time IS NULL, t.due_time, t.created_at, t.id`,
    from,
    to,
  ).map(toTask);
}

/** Tasks with a time block starting on `date` (a local day, which may be 23 or 25 hours long). */
export function listBlocksOn(ctx: Ctx, date: LocalDate): Task[] {
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.status != 'someday'
       AND t.scheduled_start >= ? AND t.scheduled_start < ?
     ORDER BY t.scheduled_start, t.id`,
    localToIso(date, '00:00'),
    localToIso(addDays(date, 1), '00:00'),
  ).map(toTask);
}

export function countCompletedOn(ctx: Ctx, date: LocalDate): number {
  const r = one(
    ctx,
    `SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND parent_id IS NULL AND status = 'done'
       AND completed_at >= ? AND completed_at < ?`,
    localToIso(date, '00:00'),
    localToIso(addDays(date, 1), '00:00'),
  );
  return Number(r?.['n'] ?? 0);
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchTasks(ctx: Ctx, query: string, limit = 30): Task[] {
  const q = query.trim();
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  return all(
    ctx,
    `${SELECT} WHERE t.deleted_at IS NULL AND (t.title LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\')
     ORDER BY (t.status = 'done'), t.updated_at DESC LIMIT ?`,
    like,
    like,
    limit,
  ).map(toTask);
}
