import { describe, expect, it } from 'vitest';
import { dayArc, formatDuration, nowNext } from '../../src/main/domain/today';
import { dueNotices, inQuietHours } from '../../src/main/domain/notify';

const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m);
const block = (id: string, from: Date, minutes: number, status = 'todo') => ({
  taskId: id,
  title: id,
  areaId: null,
  status,
  startMs: from.getTime(),
  endMs: from.getTime() + minutes * 60_000,
});

describe('nowNext', () => {
  const blocks = [
    block('Spanish', at(16), 20),
    block('Grade', at(14), 90),
    block('Lunch', at(12, 30), 45, 'done'),
    block('Coach', at(17, 30), 60),
  ];

  it('finds the running block and how long is left', () => {
    const r = nowNext(blocks, at(14, 50).getTime());
    expect(r.now).toMatchObject({ taskId: 'Grade', minutesLeft: 40 });
    expect(r.next).toMatchObject({ taskId: 'Spanish', startsInMinutes: 70 });
  });

  it('has no Now between blocks, and Next is the first block ahead', () => {
    const r = nowNext(blocks, at(15, 45).getTime());
    expect(r.now).toBeNull();
    expect(r.next).toMatchObject({ taskId: 'Spanish', startsInMinutes: 15 });
  });

  it('treats the end of a block as the end, and its start as inside', () => {
    expect(nowNext(blocks, at(14).getTime()).now?.taskId).toBe('Grade');
    expect(nowNext(blocks, at(15, 30).getTime()).now).toBeNull();
  });

  it('ignores finished blocks and has nothing once the day is done', () => {
    expect(nowNext(blocks, at(12, 40).getTime()).now).toBeNull();
    const late = nowNext(blocks, at(19).getTime());
    expect(late.now).toBeNull();
    expect(late.next).toBeNull();
  });
});

describe('dayArc', () => {
  it('shows how much of the window has passed', () => {
    expect(dayArc('07:00', '22:00', at(7))).toMatchObject({
      phase: 'during',
      fraction: 0,
      minutesLeft: 900,
    });
    const midday = dayArc('07:00', '22:00', at(14, 30));
    expect(midday.phase).toBe('during');
    expect(midday.minutesLeft).toBe(450); // 7h 30m
    expect(midday.fraction).toBeCloseTo(0.5, 5);
  });
  it('is before or after the window outside it', () => {
    expect(dayArc('07:00', '22:00', at(6, 59)).phase).toBe('before');
    expect(dayArc('07:00', '22:00', at(22))).toMatchObject({
      phase: 'after',
      fraction: 1,
      minutesLeft: 0,
    });
  });
  it('rejects a day that ends before it starts', () => {
    expect(() => dayArc('22:00', '07:00', at(10))).toThrow();
  });
});

describe('formatDuration', () => {
  it('reads like the plan: 1h 10m', () => {
    expect(formatDuration(70)).toBe('1h 10m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(420)).toBe('7h');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('quiet hours', () => {
  const quiet = { start: '21:30', end: '06:30' };
  it('runs past midnight', () => {
    expect(inQuietHours('21:29', quiet)).toBe(false);
    expect(inQuietHours('21:30', quiet)).toBe(true);
    expect(inQuietHours('23:59', quiet)).toBe(true);
    expect(inQuietHours('00:00', quiet)).toBe(true);
    expect(inQuietHours('06:29', quiet)).toBe(true);
    expect(inQuietHours('06:30', quiet)).toBe(false);
  });
  it('also works inside one day, and is off when start equals end', () => {
    expect(inQuietHours('12:30', { start: '12:00', end: '13:00' })).toBe(true);
    expect(inQuietHours('13:00', { start: '12:00', end: '13:00' })).toBe(false);
    expect(inQuietHours('03:00', { start: '08:00', end: '08:00' })).toBe(false);
  });
});

describe('dueNotices', () => {
  const quiet = { start: '21:30', end: '06:30' };
  const task = (over: Record<string, unknown>) => ({
    id: 't1',
    title: 'Call the vet',
    status: 'todo',
    dueDate: '2026-10-14',
    dueTime: '15:00',
    scheduledStart: null,
    ...over,
  });
  const run = (
    now: Date,
    tasks: ReturnType<typeof task>[],
    sent = new Set<string>(),
    maintenance = [],
  ) => dueNotices({ now, tasks, maintenance, quiet, sent });

  it('fires at the due time, then not again', () => {
    expect(run(at(14, 59), [task({})])).toHaveLength(0);
    const first = run(at(15, 0), [task({})]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ title: 'Due now', body: 'Call the vet' });
    expect(run(at(15, 1), [task({})], new Set(first.map((n) => n.key)))).toHaveLength(0);
  });

  it('does not announce something that is long past, for example after a restart', () => {
    expect(run(at(15, 16), [task({})])).toHaveLength(0);
    expect(run(at(15, 15), [task({})])).toHaveLength(1);
  });

  it('skips finished and someday tasks and other days', () => {
    expect(run(at(15), [task({ status: 'done' })])).toHaveLength(0);
    expect(run(at(15), [task({ status: 'someday' })])).toHaveLength(0);
    expect(run(at(15), [task({ dueDate: '2026-10-15' })])).toHaveLength(0);
  });

  it('announces a time block when it starts', () => {
    const t = task({ dueDate: null, dueTime: null, scheduledStart: at(16).toISOString() });
    expect(run(at(15, 59), [t])).toHaveLength(0);
    expect(run(at(16), [t])[0]).toMatchObject({ title: 'Starting now' });
  });

  it('stays silent in quiet hours', () => {
    const late = task({ dueTime: '22:00' });
    expect(run(at(22, 0), [late])).toHaveLength(0);
  });

  it('reminds about maintenance once a day, from 8:00, only when it is coming due', () => {
    const maint = [
      {
        id: 'm1',
        name: 'Replace the HVAC air filter',
        state: 'due-soon' as const,
        statusText: 'due in 5 days',
      },
      {
        id: 'm2',
        name: 'Clean the dryer vent',
        state: 'ok' as const,
        statusText: 'due in 90 days',
      },
      {
        id: 'm3',
        name: 'Test the smoke detectors',
        state: 'overdue' as const,
        statusText: 'was due yesterday',
      },
    ];
    expect(run(at(7, 59), [], new Set(), maint as never)).toHaveLength(0);
    const eight = run(at(8), [], new Set(), maint as never);
    expect(eight.map((n) => n.title)).toEqual([
      'Replace the HVAC air filter',
      'Test the smoke detectors',
    ]);
    expect(run(at(9), [], new Set(eight.map((n) => n.key)), maint as never)).toHaveLength(0);
    // The next day it can fire again.
    expect(run(at(8, 5, 15), [], new Set(eight.map((n) => n.key)), maint as never)).toHaveLength(2);
  });
});
