import type { LocalDate } from '@shared/dates';
import type { MaintenanceCreate, MaintenanceItem, MaintenanceUpdate } from '@shared/core';
import { describeMaintenance, maintenanceStatus } from '../domain/maintenance';
import { all, int, mutate, one, run, str, strOrNull } from './context';
import type { Ctx, Mutation, Row } from './context';

function toItem(ctx: Ctx, r: Row): MaintenanceItem {
  const lastDone = strOrNull(r, 'last_done');
  const intervalDays = int(r, 'interval_days');
  const leadDays = int(r, 'lead_days');
  const status = maintenanceStatus({ lastDone, intervalDays, leadDays }, ctx.today());
  return {
    id: str(r, 'id'),
    name: str(r, 'name'),
    areaId: strOrNull(r, 'area_id'),
    intervalDays,
    lastDone,
    leadDays,
    notes: strOrNull(r, 'notes'),
    nextDue: status.nextDue,
    state: status.state,
    daysSince: status.daysSince,
    daysUntilDue: status.daysUntilDue,
    statusText: describeMaintenance(status),
  };
}

export function getMaintenance(ctx: Ctx, id: string): MaintenanceItem | null {
  const r = one(ctx, 'SELECT * FROM maintenance_items WHERE id = ? AND deleted_at IS NULL', id);
  return r ? toItem(ctx, r) : null;
}

/** Most urgent first; items with no last-done date come last, asking to be set up. */
export function listMaintenance(ctx: Ctx): MaintenanceItem[] {
  const rank = { overdue: 0, 'due-soon': 1, ok: 2, unknown: 3 } as const;
  return all(ctx, 'SELECT * FROM maintenance_items WHERE deleted_at IS NULL ORDER BY name')
    .map((r) => toItem(ctx, r))
    .sort(
      (a, b) =>
        rank[a.state] - rank[b.state] ||
        (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

function homeAreaId(ctx: Ctx): string | null {
  const r = one(
    ctx,
    `SELECT id FROM areas WHERE kind = 'home' AND archived_at IS NULL ORDER BY sort_order LIMIT 1`,
  );
  return r ? str(r, 'id') : null;
}

export function createMaintenance(
  ctx: Ctx,
  input: MaintenanceCreate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<MaintenanceItem> {
  return mutate(ctx, actor, 'maintenance.create', (tx) => {
    const id = ctx.newId();
    const stamp = ctx.nowIso();
    run(
      ctx,
      `INSERT INTO maintenance_items (id, name, area_id, interval_days, last_done, lead_days, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      homeAreaId(ctx),
      input.intervalDays,
      input.lastDone ?? null,
      input.leadDays ?? 7,
      input.notes ?? null,
      stamp,
      stamp,
    );
    tx.created('maintenance_items', id);
    return {
      result: getMaintenance(ctx, id) as MaintenanceItem,
      summary: `Added "${input.name}" to home maintenance`,
    };
  });
}

export function updateMaintenance(
  ctx: Ctx,
  patch: MaintenanceUpdate,
  actor: 'user' | 'atlas' = 'user',
): Mutation<MaintenanceItem> {
  const item = getMaintenance(ctx, patch.id);
  if (!item) throw new Error('That maintenance item no longer exists');
  return mutate(ctx, actor, 'maintenance.update', (tx) => {
    tx.before('maintenance_items', item.id);
    run(
      ctx,
      `UPDATE maintenance_items SET name = ?, interval_days = ?, last_done = ?, lead_days = ?, notes = ?,
         updated_at = ? WHERE id = ?`,
      patch.name ?? item.name,
      patch.intervalDays ?? item.intervalDays,
      patch.lastDone === undefined ? item.lastDone : patch.lastDone,
      patch.leadDays ?? item.leadDays,
      patch.notes === undefined ? item.notes : patch.notes,
      ctx.nowIso(),
      item.id,
    );
    return {
      result: getMaintenance(ctx, item.id) as MaintenanceItem,
      summary: `Updated "${patch.name ?? item.name}"`,
    };
  });
}

/** Marks it done: writes a log row and sets the last-done date (today unless one is given). */
export function markMaintenanceDone(
  ctx: Ctx,
  id: string,
  date?: LocalDate,
  note?: string,
  actor: 'user' | 'atlas' = 'user',
): Mutation<MaintenanceItem> {
  const item = getMaintenance(ctx, id);
  if (!item) throw new Error('That maintenance item no longer exists');
  const doneOn = date ?? ctx.today();
  return mutate(ctx, actor, 'maintenance.done', (tx) => {
    tx.before('maintenance_items', id);
    const logId = ctx.newId();
    const stamp = ctx.nowIso();
    run(
      ctx,
      `INSERT INTO maintenance_log (id, item_id, done_on, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      logId,
      id,
      doneOn,
      note ?? null,
      stamp,
      stamp,
    );
    tx.created('maintenance_log', logId);
    run(
      ctx,
      'UPDATE maintenance_items SET last_done = ?, updated_at = ? WHERE id = ?',
      doneOn,
      stamp,
      id,
    );
    return {
      result: getMaintenance(ctx, id) as MaintenanceItem,
      summary: `Marked "${item.name}" done`,
    };
  });
}

export function deleteMaintenance(
  ctx: Ctx,
  id: string,
  actor: 'user' | 'atlas' = 'user',
): Mutation<void> {
  const item = getMaintenance(ctx, id);
  if (!item) throw new Error('That maintenance item no longer exists');
  return mutate(ctx, actor, 'maintenance.delete', (tx) => {
    tx.before('maintenance_items', id);
    run(
      ctx,
      'UPDATE maintenance_items SET deleted_at = ?, updated_at = ? WHERE id = ?',
      ctx.nowIso(),
      ctx.nowIso(),
      id,
    );
    return { result: undefined, summary: `Removed "${item.name}" from home maintenance` };
  });
}

export function searchMaintenance(ctx: Ctx, query: string): MaintenanceItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listMaintenance(ctx).filter(
    (m) => m.name.toLowerCase().includes(q) || (m.notes ?? '').toLowerCase().includes(q),
  );
}
