import { z } from 'zod';
import { addDays, localToIso, toLocalDate } from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import { ulid } from '../domain/ulid';
import type { Db } from './connection';

/**
 * What every store function needs, plus the one way to change data: `mutate`.
 *
 * Every change runs in a transaction and writes an `action_log` row with the INVERSE of what it
 * did (PLAN §7.5). Undo is therefore not a feature of each screen: it just applies the inverse.
 * An inverse is a list of two kinds of step, applied in reverse order:
 *   restore  put a row back exactly as it was before the change
 *   remove   delete a row the change created
 */
export type Row = Record<string, string | number | null>;

export const UNDOABLE_TABLES = [
  'areas',
  'tasks',
  'maintenance_items',
  'maintenance_log',
  'wins',
] as const;
export type UndoableTable = (typeof UNDOABLE_TABLES)[number];

const InverseOps = z.array(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('restore'),
      table: z.enum(UNDOABLE_TABLES),
      row: z.record(
        z.string().regex(/^[a-z][a-z_]*$/),
        z.union([z.string(), z.number(), z.null()]),
      ),
    }),
    z.object({ kind: z.literal('remove'), table: z.enum(UNDOABLE_TABLES), id: z.string() }),
  ]),
);
export type InverseOp = z.infer<typeof InverseOps>[number];

export interface Ctx {
  db: Db;
  now(): Date;
  nowIso(): string;
  today(): LocalDate;
  newId(): string;
  /** Set while a mutation is running, so a nested one fails loudly instead of corrupting the log. */
  inMutation: boolean;
  /**
   * Runs inside every change and every undo, in the same transaction, to bring XP, wins and
   * achievements in line with the data (db/ledger.ts `settle`).
   */
  afterChange?: () => void;
  /** True while an undo is being applied: the ledger may only take points back, never award. */
  undoing: boolean;
  /** What the last changes earned. The screen reads it once to celebrate, then clears it. */
  award: Award;
}

export interface Award {
  /** Net XP change since it was last taken (negative after an undo). */
  xp: number;
  /** Achievement keys unlocked since it was last taken. */
  unlocked: string[];
  /** A big moment: a large task, a frog, or a cleared day. */
  big: boolean;
}

export const noAward = (): Award => ({ xp: 0, unlocked: [], big: false });

export function createCtx(
  db: Db,
  clock: () => Date = () => new Date(),
  newId: () => string = () => ulid(),
): Ctx {
  return {
    db,
    now: clock,
    nowIso: () => clock().toISOString(),
    today: () => toLocalDate(clock()),
    newId,
    inMutation: false,
    undoing: false,
    award: noAward(),
  };
}

export const str = (row: Row, key: string): string => String(row[key] ?? '');
export const strOrNull = (row: Row, key: string): string | null =>
  row[key] === null || row[key] === undefined ? null : String(row[key]);
export const int = (row: Row, key: string): number => Number(row[key] ?? 0);
export const intOrNull = (row: Row, key: string): number | null =>
  row[key] === null || row[key] === undefined ? null : Number(row[key]);

export function all(ctx: Ctx, sql: string, ...params: (string | number | null)[]): Row[] {
  return ctx.db.prepare(sql).all(...params) as Row[];
}
export function one(ctx: Ctx, sql: string, ...params: (string | number | null)[]): Row | undefined {
  return ctx.db.prepare(sql).get(...params) as Row | undefined;
}
export function run(ctx: Ctx, sql: string, ...params: (string | number | null)[]): void {
  ctx.db.prepare(sql).run(...params);
}

/** Records what a change touches, so it can be undone. */
export class Tx {
  readonly ops: InverseOp[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly ctx: Ctx) {}

  /** Call before changing an existing row. Only the first call per row counts. */
  before(table: UndoableTable, id: string): void {
    const key = `${table}:${id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const row = one(this.ctx, `SELECT * FROM ${table} WHERE id = ?`, id);
    if (row) this.ops.push({ kind: 'restore', table, row });
  }

  /** Call after inserting a row. */
  created(table: UndoableTable, id: string): void {
    this.seen.add(`${table}:${id}`);
    this.ops.push({ kind: 'remove', table, id });
  }
}

export interface Mutation<T> {
  result: T;
  /** The `action_log` id, which the toast uses to offer Undo. */
  logId: string;
  summary: string;
}

export function mutate<T>(
  ctx: Ctx,
  actor: 'user' | 'atlas',
  action: string,
  fn: (tx: Tx) => { result: T; summary: string; payload?: Record<string, unknown> },
): Mutation<T> {
  if (ctx.inMutation) throw new Error('A change cannot start inside another change');
  ctx.inMutation = true;
  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    const tx = new Tx(ctx);
    const { result, summary, payload } = fn(tx);
    ctx.afterChange?.();
    const logId = ctx.newId();
    const stamp = ctx.nowIso();
    run(
      ctx,
      `INSERT INTO action_log (id, actor, action, payload_json, inverse_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      logId,
      actor,
      action,
      JSON.stringify({ summary, ...payload }),
      JSON.stringify(tx.ops),
      stamp,
      stamp,
    );
    ctx.db.exec('COMMIT');
    return { result, logId, summary };
  } catch (error) {
    ctx.db.exec('ROLLBACK');
    throw error;
  } finally {
    ctx.inMutation = false;
  }
}

function applyOp(ctx: Ctx, op: InverseOp): void {
  if (op.kind === 'remove') {
    run(ctx, `DELETE FROM ${op.table} WHERE id = ?`, op.id);
    return;
  }
  const columns = Object.keys(op.row);
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
  // An upsert, not INSERT OR REPLACE: a replace would delete the row first and trip foreign keys.
  run(
    ctx,
    `INSERT INTO ${op.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    ...columns.map((c) => op.row[c] as string | number | null),
  );
}

export interface UndoResult {
  summary: string;
}

/** Undoes one logged change. Returns null when it does not exist or was already undone. */
export function undoEntry(ctx: Ctx, id: string): UndoResult | null {
  const entry = one(ctx, 'SELECT * FROM action_log WHERE id = ?', id);
  if (!entry || entry['undone_at'] !== null) return null;
  const ops = InverseOps.parse(JSON.parse(str(entry, 'inverse_json')));
  const summary = String(
    (JSON.parse(str(entry, 'payload_json')) as { summary?: string }).summary ?? '',
  );
  if (ctx.inMutation) throw new Error('Cannot undo during a change');
  ctx.inMutation = true;
  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    for (const op of [...ops].reverse()) applyOp(ctx, op);
    ctx.undoing = true;
    try {
      ctx.afterChange?.();
    } finally {
      ctx.undoing = false;
    }
    run(
      ctx,
      'UPDATE action_log SET undone_at = ?, updated_at = ? WHERE id = ?',
      ctx.nowIso(),
      ctx.nowIso(),
      id,
    );
    ctx.db.exec('COMMIT');
    return { summary };
  } catch (error) {
    ctx.db.exec('ROLLBACK');
    throw error;
  } finally {
    ctx.inMutation = false;
  }
}

export interface LogEntry {
  id: string;
  actor: 'user' | 'atlas';
  action: string;
  summary: string;
  createdAt: string;
  undone: boolean;
}

const toLogEntry = (r: Row): LogEntry => ({
  id: str(r, 'id'),
  actor: str(r, 'actor') as 'user' | 'atlas',
  action: str(r, 'action'),
  summary: String((JSON.parse(str(r, 'payload_json')) as { summary?: string }).summary ?? ''),
  createdAt: str(r, 'created_at'),
  undone: r['undone_at'] !== null,
});

export function listLog(ctx: Ctx, limit = 20): LogEntry[] {
  return all(ctx, 'SELECT * FROM action_log ORDER BY created_at DESC, id DESC LIMIT ?', limit).map(
    toLogEntry,
  );
}

/** The newest change that has not been undone. */
export function latestUndoable(ctx: Ctx): LogEntry | null {
  const r = one(
    ctx,
    'SELECT id FROM action_log WHERE undone_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  if (!r) return null;
  return listLog(ctx, 100).find((e) => e.id === str(r, 'id')) ?? null;
}

/** What Atlas changed on a local day, newest first, for the panel's "changed today" list. */
export function listAtlasChanges(ctx: Ctx, day: LocalDate): LogEntry[] {
  const from = localToIso(day, '00:00');
  const to = localToIso(addDays(day, 1), '00:00');
  return all(
    ctx,
    `SELECT * FROM action_log WHERE actor = 'atlas' AND created_at >= ? AND created_at < ?
     ORDER BY created_at DESC, id DESC`,
    from,
    to,
  ).map(toLogEntry);
}
