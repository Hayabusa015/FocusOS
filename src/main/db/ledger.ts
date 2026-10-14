import { addDays, isoToLocalDate, localToIso } from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import type {
  AchievementView,
  FocusResult,
  FocusSession,
  GamificationSummary,
  Win,
  WinsView,
} from '@shared/core';
import { ACHIEVEMENTS } from '../domain/achievements';
import type { AchievementStats } from '../domain/achievements';
import {
  INBOX_ZERO_XP,
  MAINTENANCE_XP,
  SHUTDOWN_XP,
  focusXp,
  isFrog,
  levelFor,
  streakWindow,
  taskXp,
} from '../domain/xp';
import type { TaskSize } from '../domain/xp';
import { all, int, mutate, one, run, str, strOrNull } from './context';
import type { Ctx, Mutation } from './context';

/**
 * XP, wins and achievements (PLAN §10).
 *
 * Nothing here is "awarded" by the screens. `settle` runs inside every change and every undo and
 * brings the ledger in line with the data: a finished task should have earned its points, a
 * reopened one should not. When they differ it adds an event for the difference (a negative one
 * after an undo), so the XP total is always the plain sum of the event rows and no row is ever
 * deleted. Because it only looks at the data, any sequence of complete and undo ends up correct.
 */

const OPEN = `('inbox', 'todo', 'doing')`;

// --- Small helpers -----------------------------------------------------------------------

function sums(ctx: Ctx, kind: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of all(
    ctx,
    'SELECT ref_id, SUM(points) AS s FROM xp_events WHERE kind = ? GROUP BY ref_id',
    kind,
  )) {
    out.set(str(r, 'ref_id'), int(r, 's'));
  }
  return out;
}

function addEvent(
  ctx: Ctx,
  kind: string,
  refId: string,
  points: number,
  areaId: string | null,
  occurredAt: string,
): void {
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT INTO xp_events (id, kind, ref_id, points, area_id, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ctx.newId(),
    kind,
    refId,
    points,
    areaId,
    occurredAt,
    stamp,
    stamp,
  );
}

function getFlag(ctx: Ctx, key: string): boolean {
  return one(ctx, 'SELECT 1 AS x FROM settings WHERE key = ?', key) !== undefined;
}
function setFlag(ctx: Ctx, key: string, value: unknown = true): void {
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value),
    stamp,
    stamp,
  );
}

const dayRange = (date: LocalDate) =>
  [localToIso(date, '00:00'), localToIso(addDays(date, 1), '00:00')] as const;

/** Whole minutes a focus session counted for: elapsed time, never more than planned. */
export function focusMinutes(startedAt: string, endedAt: string, planned: number): number {
  const elapsed = Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
  return Math.max(0, Math.min(planned, elapsed));
}

export function inboxCount(ctx: Ctx): number {
  return int(
    one(
      ctx,
      `SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND parent_id IS NULL
         AND area_id IS NULL AND status IN ${OPEN}`,
    ) ?? {},
    'n',
  );
}

// --- Settling ----------------------------------------------------------------------------

export function settle(ctx: Ctx): void {
  const stamp = ctx.nowIso();
  const today = ctx.today();
  let delta = 0;
  let big = false;

  // Tasks: top-level tasks that are done earn points; steps do not.
  const taskHave = sums(ctx, 'task');
  const done = all(
    ctx,
    `SELECT id, size, defer_count, area_id, completed_at FROM tasks
     WHERE status = 'done' AND deleted_at IS NULL AND parent_id IS NULL`,
  );
  const wanted = new Map<
    string,
    { points: number; area: string | null; at: string; big: boolean }
  >();
  for (const t of done) {
    const defer = int(t, 'defer_count');
    const size = str(t, 'size') as TaskSize;
    wanted.set(str(t, 'id'), {
      points: taskXp(size, defer),
      area: strOrNull(t, 'area_id'),
      at: strOrNull(t, 'completed_at') ?? stamp,
      big: size === 'l' || isFrog(defer),
    });
  }
  for (const ref of new Set([...wanted.keys(), ...taskHave.keys()])) {
    const want = wanted.get(ref);
    const diff = (want?.points ?? 0) - (taskHave.get(ref) ?? 0);
    if (diff === 0) continue;
    const area =
      want?.area ??
      strOrNull(one(ctx, 'SELECT area_id FROM tasks WHERE id = ?', ref) ?? {}, 'area_id');
    addEvent(ctx, 'task', ref, diff, area, diff > 0 ? (want?.at ?? stamp) : stamp);
    delta += diff;
    if (diff > 0 && want?.big) big = true;
  }

  // Maintenance: each log entry is worth a fixed amount.
  const maintHave = sums(ctx, 'maintenance');
  const logs = all(
    ctx,
    `SELECT l.id, l.created_at, i.area_id FROM maintenance_log l
     LEFT JOIN maintenance_items i ON i.id = l.item_id`,
  );
  const logIds = new Set<string>();
  for (const l of logs) {
    const id = str(l, 'id');
    logIds.add(id);
    const diff = MAINTENANCE_XP - (maintHave.get(id) ?? 0);
    if (diff !== 0) {
      addEvent(ctx, 'maintenance', id, diff, strOrNull(l, 'area_id'), str(l, 'created_at'));
      delta += diff;
    }
  }
  for (const [id, have] of maintHave) {
    if (logIds.has(id) || have === 0) continue;
    addEvent(ctx, 'maintenance', id, -have, null, stamp);
    delta -= have;
  }

  // Focus: one point for each five minutes of a completed session.
  const focusHave = sums(ctx, 'focus');
  for (const f of all(
    ctx,
    `SELECT id, area_id, planned_minutes, started_at, ended_at FROM focus_sessions
     WHERE completed = 1 AND ended_at IS NOT NULL`,
  )) {
    const id = str(f, 'id');
    const points = focusXp(
      focusMinutes(str(f, 'started_at'), str(f, 'ended_at'), int(f, 'planned_minutes')),
    );
    const diff = points - (focusHave.get(id) ?? 0);
    if (diff !== 0) {
      addEvent(ctx, 'focus', id, diff, strOrNull(f, 'area_id'), str(f, 'ended_at'));
      delta += diff;
    }
  }

  // Inbox emptied: once a day, and only if there was something in it today.
  const count = inboxCount(ctx);
  const sawKey = `inbox.saw.${today}`;
  if (count > 0) setFlag(ctx, sawKey);
  const emptied = count === 0 && getFlag(ctx, sawKey);
  const zeroDiff = (emptied ? INBOX_ZERO_XP : 0) - (sums(ctx, 'inbox-zero').get(today) ?? 0);
  if (zeroDiff !== 0) {
    addEvent(ctx, 'inbox-zero', today, zeroDiff, null, stamp);
    delta += zeroDiff;
  }

  settleWins(ctx);

  const stats = collectStats(ctx);
  if (delta > 0 && stats.cleanSweepToday) big = true;
  const have = new Set(
    all(ctx, 'SELECT achievement_key FROM achievements_unlocked').map((r) =>
      str(r, 'achievement_key'),
    ),
  );
  for (const def of ACHIEVEMENTS) {
    if (have.has(def.key) || !def.unlocked(stats)) continue;
    run(
      ctx,
      `INSERT INTO achievements_unlocked (id, achievement_key, unlocked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ctx.newId(),
      def.key,
      stamp,
      stamp,
      stamp,
    );
    ctx.award.unlocked.push(def.key);
  }
  ctx.award.xp += delta;
  if (big) ctx.award.big = true;
}

/** A finished task or maintenance entry writes a win; undoing it takes the win away. */
function settleWins(ctx: Ctx): void {
  const stamp = ctx.nowIso();
  const wanted = new Map<string, { text: string; at: string }>();
  for (const t of all(
    ctx,
    `SELECT id, title, completed_at FROM tasks
     WHERE status = 'done' AND deleted_at IS NULL AND parent_id IS NULL`,
  )) {
    wanted.set(str(t, 'id'), { text: str(t, 'title'), at: strOrNull(t, 'completed_at') ?? stamp });
  }
  for (const l of all(
    ctx,
    `SELECT l.id, l.created_at, i.name FROM maintenance_log l
     LEFT JOIN maintenance_items i ON i.id = l.item_id`,
  )) {
    wanted.set(str(l, 'id'), {
      text: `Home: ${strOrNull(l, 'name') ?? 'maintenance'}`,
      at: str(l, 'created_at'),
    });
  }

  const live = new Map<string, string>();
  const gone = new Map<string, string>();
  for (const w of all(ctx, 'SELECT id, ref_id, deleted_at FROM wins WHERE ref_id IS NOT NULL')) {
    (w['deleted_at'] === null ? live : gone).set(str(w, 'ref_id'), str(w, 'id'));
  }
  for (const [ref, win] of wanted) {
    if (live.has(ref)) continue;
    const revived = gone.get(ref);
    if (revived) {
      run(
        ctx,
        'UPDATE wins SET deleted_at = NULL, text = ?, occurred_at = ?, updated_at = ? WHERE id = ?',
        win.text,
        win.at,
        stamp,
        revived,
      );
    } else {
      run(
        ctx,
        `INSERT INTO wins (id, text, occurred_at, ref_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ctx.newId(),
        win.text,
        win.at,
        ref,
        stamp,
        stamp,
      );
    }
  }
  for (const [ref, id] of live) {
    if (!wanted.has(ref))
      run(ctx, 'UPDATE wins SET deleted_at = ?, updated_at = ? WHERE id = ?', stamp, stamp, id);
  }
}

function winsByDate(ctx: Ctx, today: LocalDate): Map<string, number> {
  const from = localToIso(addDays(today, -6), '00:00');
  const out = new Map<string, number>();
  for (const w of all(
    ctx,
    'SELECT occurred_at FROM wins WHERE deleted_at IS NULL AND occurred_at >= ?',
    from,
  )) {
    const date = isoToLocalDate(str(w, 'occurred_at'));
    out.set(date, (out.get(date) ?? 0) + 1);
  }
  return out;
}

export function totalXp(ctx: Ctx): number {
  return int(one(ctx, 'SELECT COALESCE(SUM(points), 0) AS s FROM xp_events') ?? {}, 's');
}

function collectStats(ctx: Ctx): AchievementStats {
  const today = ctx.today();
  const n = (sql: string, ...p: (string | number)[]) => int(one(ctx, sql, ...p) ?? {}, 'n');
  const due = n(
    `SELECT COUNT(*) AS n FROM tasks WHERE due_date = ? AND deleted_at IS NULL AND parent_id IS NULL
       AND status != 'someday'`,
    today,
  );
  const open = n(
    `SELECT COUNT(*) AS n FROM tasks WHERE due_date = ? AND deleted_at IS NULL AND parent_id IS NULL
       AND status IN ${OPEN}`,
    today,
  );
  let longest = 0;
  for (const f of all(
    ctx,
    'SELECT planned_minutes, started_at, ended_at FROM focus_sessions WHERE completed = 1 AND ended_at IS NOT NULL',
  )) {
    longest = Math.max(
      longest,
      focusMinutes(str(f, 'started_at'), str(f, 'ended_at'), int(f, 'planned_minutes')),
    );
  }
  const units = all(
    ctx,
    `SELECT unit_code, SUM(CASE WHEN status IN ${OPEN} THEN 1 ELSE 0 END) AS open FROM tasks
     WHERE unit_code IS NOT NULL AND deleted_at IS NULL AND parent_id IS NULL AND status != 'someday'
     GROUP BY unit_code`,
  );
  return {
    tasksEver: n('SELECT COUNT(*) AS n FROM tasks'),
    inboxZeroDays: n(
      `SELECT COUNT(*) AS n FROM (SELECT ref_id FROM xp_events WHERE kind = 'inbox-zero'
         GROUP BY ref_id HAVING SUM(points) > 0)`,
    ),
    frogsEaten: n(
      `SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND deleted_at IS NULL
         AND parent_id IS NULL AND defer_count >= 2`,
    ),
    cleanSweepToday: due > 0 && open === 0,
    longestFocusMinutes: longest,
    maintenanceDone: n('SELECT COUNT(*) AS n FROM maintenance_log'),
    unitsClosed: units.filter((u) => int(u, 'open') === 0).length,
    activeDaysLast7: streakWindow(winsByDate(ctx, today), today).active,
    shutdowns: n(
      `SELECT COUNT(*) AS n FROM (SELECT ref_id FROM xp_events WHERE kind = 'shutdown'
         GROUP BY ref_id HAVING SUM(points) > 0)`,
    ),
    level: levelFor(totalXp(ctx)).level,
  };
}

/** Reads what the last changes earned, once. The screen uses it to celebrate. */
export function takeAward(ctx: Ctx) {
  const award = ctx.award;
  ctx.award = { xp: 0, unlocked: [], big: false };
  return {
    xp: award.xp,
    big: award.big,
    unlocked: award.unlocked.map((key) => ({
      key,
      title: ACHIEVEMENTS.find((a) => a.key === key)?.title ?? key,
    })),
  };
}

// --- What the screens read ---------------------------------------------------------------

function xpOn(ctx: Ctx, date: LocalDate): number {
  const [from, to] = dayRange(date);
  return int(
    one(
      ctx,
      'SELECT COALESCE(SUM(points), 0) AS s FROM xp_events WHERE occurred_at >= ? AND occurred_at < ?',
      from,
      to,
    ) ?? {},
    's',
  );
}

export const xpToday = (ctx: Ctx): number => xpOn(ctx, ctx.today());

export function winsOn(ctx: Ctx, date: LocalDate): Win[] {
  const [from, to] = dayRange(date);
  return all(
    ctx,
    'SELECT * FROM wins WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id',
    from,
    to,
  ).map(toWin);
}

const toWin = (r: Record<string, string | number | null>): Win => ({
  id: str(r, 'id'),
  text: str(r, 'text'),
  occurredAt: str(r, 'occurred_at'),
  refId: strOrNull(r, 'ref_id'),
});

export function getSummary(ctx: Ctx): GamificationSummary {
  const today = ctx.today();
  const total = totalXp(ctx);
  const level = levelFor(total);
  const byDate = winsByDate(ctx, today);
  const streak = streakWindow(byDate, today);
  return {
    totalXp: total,
    level: level.level,
    xpIntoLevel: level.xpIntoLevel,
    xpForNext: level.xpForNext,
    progress: level.progress,
    xpToday: xpOn(ctx, today),
    winsToday: byDate.get(today) ?? 0,
    streak,
    achievementsUnlocked: int(
      one(ctx, 'SELECT COUNT(*) AS n FROM achievements_unlocked') ?? {},
      'n',
    ),
    achievementsTotal: ACHIEVEMENTS.length,
  };
}

export function getWinsView(ctx: Ctx): WinsView {
  const today = ctx.today();
  const summary = getSummary(ctx);
  const week = summary.streak.days.map((d) => ({
    date: d.date,
    wins: d.wins,
    xp: xpOn(ctx, d.date),
    active: d.active,
  }));
  const recent = [];
  for (let i = 1; i <= 6; i++) {
    const date = addDays(today, -i);
    const wins = winsOn(ctx, date);
    if (wins.length > 0) recent.push({ date, wins });
  }
  const unlocked = new Map(
    all(ctx, 'SELECT achievement_key, unlocked_at FROM achievements_unlocked').map((r) => [
      str(r, 'achievement_key'),
      str(r, 'unlocked_at'),
    ]),
  );
  const achievements: AchievementView[] = ACHIEVEMENTS.map((a) => ({
    key: a.key,
    title: a.title,
    description: a.description,
    unlockedAt: unlocked.get(a.key) ?? null,
  }));
  return { summary, todayWins: winsOn(ctx, today), week, recent, achievements };
}

/** Logs a win in your own words ("handled a tough parent call"). Undoable. */
export function logWin(ctx: Ctx, text: string, actor: 'user' | 'atlas' = 'user'): Mutation<Win> {
  return mutate(ctx, actor, 'win.log', (tx) => {
    const id = ctx.newId();
    const stamp = ctx.nowIso();
    run(
      ctx,
      `INSERT INTO wins (id, text, occurred_at, ref_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)`,
      id,
      text,
      stamp,
      stamp,
      stamp,
    );
    tx.created('wins', id);
    const row = one(ctx, 'SELECT * FROM wins WHERE id = ?', id) ?? {};
    return { result: toWin(row), summary: `Logged a win: ${text}` };
  });
}

// --- Focus sessions ----------------------------------------------------------------------

function toFocus(ctx: Ctx, r: Record<string, string | number | null>): FocusSession {
  const taskId = strOrNull(r, 'task_id');
  const title = taskId
    ? strOrNull(one(ctx, 'SELECT title FROM tasks WHERE id = ?', taskId) ?? {}, 'title')
    : null;
  return {
    id: str(r, 'id'),
    taskId,
    taskTitle: title,
    areaId: strOrNull(r, 'area_id'),
    plannedMinutes: int(r, 'planned_minutes'),
    startedAt: str(r, 'started_at'),
    endedAt: strOrNull(r, 'ended_at'),
    completed: int(r, 'completed') === 1,
  };
}

/** Runs `fn` in its own transaction and settles the ledger before it commits. */
function inTransaction<T>(ctx: Ctx, fn: () => T): T {
  if (ctx.inMutation) throw new Error('A change cannot start inside another change');
  ctx.inMutation = true;
  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    ctx.afterChange?.();
    ctx.db.exec('COMMIT');
    return result;
  } catch (error) {
    ctx.db.exec('ROLLBACK');
    throw error;
  } finally {
    ctx.inMutation = false;
  }
}

/** The running session, if any. One left over from long ago (the app was closed) is ended. */
export function activeFocus(ctx: Ctx): FocusSession | null {
  const r = one(
    ctx,
    'SELECT * FROM focus_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  if (!r) return null;
  const limit = Date.parse(str(r, 'started_at')) + (int(r, 'planned_minutes') + 120) * 60_000;
  if (ctx.now().getTime() > limit) {
    run(
      ctx,
      'UPDATE focus_sessions SET ended_at = ?, updated_at = ? WHERE id = ?',
      ctx.nowIso(),
      ctx.nowIso(),
      str(r, 'id'),
    );
    return null;
  }
  return toFocus(ctx, r);
}

export function startFocus(
  ctx: Ctx,
  input: { taskId?: string | null; plannedMinutes: number },
): FocusSession {
  if (activeFocus(ctx)) throw new Error('A focus session is already running');
  let areaId: string | null = null;
  if (input.taskId) {
    const t = one(
      ctx,
      'SELECT area_id FROM tasks WHERE id = ? AND deleted_at IS NULL',
      input.taskId,
    );
    if (!t) throw new Error('That task no longer exists');
    areaId = strOrNull(t, 'area_id');
  }
  const id = ctx.newId();
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT INTO focus_sessions (id, area_id, task_id, planned_minutes, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    areaId,
    input.taskId ?? null,
    input.plannedMinutes,
    stamp,
    stamp,
    stamp,
  );
  return toFocus(ctx, one(ctx, 'SELECT * FROM focus_sessions WHERE id = ?', id) ?? {});
}

/** Ends a session. Completed ones earn XP for the minutes they ran; ending early earns none. */
export function finishFocus(ctx: Ctx, id: string, completed: boolean): FocusResult {
  const r = one(ctx, 'SELECT * FROM focus_sessions WHERE id = ?', id);
  if (!r) throw new Error('That focus session does not exist');
  if (r['ended_at'] !== null) return { session: toFocus(ctx, r), xp: 0 };
  const stamp = ctx.nowIso();
  const before = ctx.award.xp;
  inTransaction(ctx, () =>
    run(
      ctx,
      'UPDATE focus_sessions SET ended_at = ?, completed = ?, updated_at = ? WHERE id = ?',
      stamp,
      completed ? 1 : 0,
      stamp,
      id,
    ),
  );
  const session = toFocus(ctx, one(ctx, 'SELECT * FROM focus_sessions WHERE id = ?', id) ?? {});
  return { session, xp: ctx.award.xp - before };
}

// --- Shutdown ----------------------------------------------------------------------------

export function shutdownDone(ctx: Ctx, date: LocalDate): boolean {
  return (sums(ctx, 'shutdown').get(date) ?? 0) > 0;
}

/** Records the shutdown ritual for today (10 XP, once a day). Returns the XP it earned. */
export function recordShutdown(ctx: Ctx): number {
  const today = ctx.today();
  if (shutdownDone(ctx, today)) return 0;
  inTransaction(ctx, () => addEvent(ctx, 'shutdown', today, SHUTDOWN_XP, null, ctx.nowIso()));
  ctx.award.xp += SHUTDOWN_XP;
  return SHUTDOWN_XP;
}

export { setFlag, getFlag };
