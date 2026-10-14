import { localToIso, startOfWeek } from '@shared/dates';
import type { Area, AreaCreate, AreaUpdate } from '@shared/core';
import { all, int, mutate, one, run, str, strOrNull } from './context';
import type { Ctx, Mutation, Row } from './context';

const COUNTS = `
  (SELECT COUNT(*) FROM tasks t WHERE t.area_id = a.id AND t.parent_id IS NULL AND t.deleted_at IS NULL
     AND t.status IN ('inbox', 'todo', 'doing')) AS open_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.area_id = a.id AND t.parent_id IS NULL AND t.deleted_at IS NULL
     AND t.status = 'done' AND t.completed_at >= ?) AS done_week`;

function toArea(r: Row): Area {
  return {
    id: str(r, 'id'),
    name: str(r, 'name'),
    kind: str(r, 'kind') as Area['kind'],
    colorToken: str(r, 'color_token'),
    icon: strOrNull(r, 'icon'),
    sortOrder: int(r, 'sort_order'),
    archivedAt: strOrNull(r, 'archived_at'),
    workworkCourse: strOrNull(r, 'workwork_course') as Area['workworkCourse'],
    openCount: int(r, 'open_count'),
    doneThisWeek: int(r, 'done_week'),
  };
}

export function listAreas(ctx: Ctx, includeArchived = false): Area[] {
  const weekStart = localToIso(startOfWeek(ctx.today()), '00:00');
  return all(
    ctx,
    `SELECT a.*, ${COUNTS} FROM areas a WHERE (? = 1 OR a.archived_at IS NULL) ORDER BY a.sort_order, a.name`,
    weekStart,
    includeArchived ? 1 : 0,
  ).map(toArea);
}

export function getArea(ctx: Ctx, id: string): Area | null {
  const weekStart = localToIso(startOfWeek(ctx.today()), '00:00');
  const r = one(ctx, `SELECT a.*, ${COUNTS} FROM areas a WHERE a.id = ?`, weekStart, id);
  return r ? toArea(r) : null;
}

const DEFAULT_AREAS = [
  { name: 'Chemistry', kind: 'class', color: 'area-chemistry', course: 'chemistry' },
  { name: 'Physics', kind: 'class', color: 'area-physics', course: 'physics' },
  { name: 'Geology', kind: 'class', color: 'area-geology', course: 'geology' },
  { name: 'Coaching', kind: 'coaching', color: 'area-coaching', course: null },
  { name: 'Home', kind: 'home', color: 'area-home', course: null },
  { name: 'Admin', kind: 'admin', color: 'area-admin', course: null },
  { name: 'Personal', kind: 'personal', color: 'area-personal', course: null },
] as const;

/** First-run seeding (PLAN §6). Not a user change, so it is not logged or undoable. */
export function seedAreas(ctx: Ctx): void {
  const stamp = ctx.nowIso();
  DEFAULT_AREAS.forEach((a, i) => {
    run(
      ctx,
      `INSERT INTO areas (id, name, kind, color_token, sort_order, workwork_course, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ctx.newId(),
      a.name,
      a.kind,
      a.color,
      (i + 1) * 10,
      a.course,
      stamp,
      stamp,
    );
  });
}

export function createArea(
  ctx: Ctx,
  input: AreaCreate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<Area> {
  return mutate(ctx, actor, 'area.create', (tx) => {
    const id = ctx.newId();
    const stamp = ctx.nowIso();
    const last = Number(
      one(ctx, 'SELECT COALESCE(MAX(sort_order), 0) AS m FROM areas')?.['m'] ?? 0,
    );
    run(
      ctx,
      `INSERT INTO areas (id, name, kind, color_token, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.kind,
      input.colorToken,
      last + 10,
      stamp,
      stamp,
    );
    tx.created('areas', id);
    return { result: getArea(ctx, id) as Area, summary: `Added the area "${input.name}"` };
  });
}

export function updateArea(
  ctx: Ctx,
  input: AreaUpdate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<Area> {
  const existing = getArea(ctx, input.id);
  if (!existing) throw new Error('That area does not exist');
  return mutate(ctx, actor, 'area.update', (tx) => {
    tx.before('areas', input.id);
    const name = input.name ?? existing.name;
    const archivedAt =
      input.archived === undefined ? existing.archivedAt : input.archived ? ctx.nowIso() : null;
    run(
      ctx,
      'UPDATE areas SET name = ?, archived_at = ?, updated_at = ? WHERE id = ?',
      name,
      archivedAt,
      ctx.nowIso(),
      input.id,
    );
    const summary =
      input.archived === true
        ? `Archived the area "${existing.name}"`
        : input.archived === false
          ? `Restored the area "${existing.name}"`
          : `Renamed "${existing.name}" to "${name}"`;
    return { result: getArea(ctx, input.id) as Area, summary };
  });
}
