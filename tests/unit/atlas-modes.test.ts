import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/core';
import type { AppSettings } from '../../src/shared/core';
import { enforcePlan, SIZE_MINUTES, SLACK_FRACTION } from '../../src/main/domain/planner';
import type { AtlasDeps } from '../../src/main/atlas/engine';
import { createMemorySecretStore } from '../../src/main/atlas/secrets';
import { TOOL_SPECS, specsFor } from '../../src/main/atlas/tools';
import { PLANNER, applyPlan, planRestOfToday } from '../../src/main/atlas/modes/planner';
import { SCRIBE, addBrainDump, brainDump } from '../../src/main/atlas/modes/scribe';
import { SORTER, applySort, sortInbox } from '../../src/main/atlas/modes/sorter';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { createStore } from '../../src/main/db/store';
import type { Store } from '../../src/main/db/store';
import { createFakeAnthropic } from '../helpers/fake-anthropic';
import type { FakeAnthropic } from '../helpers/fake-anthropic';

let now: Date;
let db: Db;
let store: Store;
let fake: FakeAnthropic;
let settings: AppSettings;
let deps: AtlasDeps;

const reply = (value: unknown) => ({
  blocks: [{ type: 'text' as const, text: JSON.stringify(value) }],
});
const area = (name: string) => store.listAreas().find((a) => a.name === name)!;

beforeEach(() => {
  now = new Date(2026, 9, 14, 10, 0, 0); // Wednesday 10:00
  db = openDatabase(':memory:');
  runMigrations(db);
  store = createStore(db, { clock: () => now });
  store.seedAreas();
  fake = createFakeAnthropic();
  settings = { ...DEFAULT_SETTINGS };
  const secrets = createMemorySecretStore();
  secrets.set('sk-ant-test-key-0123456789abcdef');
  deps = { store, secrets, settings: () => settings, createClient: fake.createClient };
});
afterEach(() => db.close());

describe('the read-only modes cannot change data (PLAN §7.8)', () => {
  it('Sorter, Planner and Scribe tool lists contain no tool that changes data', () => {
    for (const mode of [SORTER, PLANNER, SCRIBE]) {
      const specs = specsFor(mode.tools);
      expect(specs.map((s) => s.name).sort()).toEqual([...mode.tools].sort());
      expect(specs.filter((s) => s.mutates).map((s) => s.name)).toEqual([]);
    }
  });

  it('the changing tools are exactly the ones flagged as changing', () => {
    expect(
      TOOL_SPECS.filter((t) => t.mutates)
        .map((t) => t.name)
        .sort(),
    ).toEqual(
      [
        'archive_task',
        'capture_to_inbox',
        'complete_task',
        'create_task',
        'create_time_block',
        'log_maintenance_done',
        'reschedule_task',
        'start_focus_session',
        'update_task',
      ].sort(),
    );
  });

  it('what each mode sends to the API is exactly its tool list', async () => {
    store.createTask({ title: 'Email the principal' });
    fake.push(reply({ proposals: [] }));
    await sortInbox(deps);
    expect(fake.requests[0]!.body.tools!.map((t) => t.name).sort()).toEqual([
      'list_areas',
      'list_tasks',
    ]);
    fake.push(reply({ tasks: [], unparsed: [] }));
    await brainDump(deps, 'nothing much');
    expect(fake.requests[1]!.body.tools ?? []).toEqual([]);
  });

  it('a mode refuses a tool list that includes a writing tool', async () => {
    const { runMode } = await import('../../src/main/atlas/modes/run');
    const { z } = await import('zod');
    await expect(
      runMode(
        deps,
        { route: 'sorter', tools: ['create_task'], instructions: '', schema: z.object({}) },
        'x',
      ),
    ).rejects.toThrow(/writing tool/);
  });

  it('modes use structured output and no forced tool choice', async () => {
    store.createTask({ title: 'Email the principal' });
    fake.push(reply({ proposals: [] }));
    await sortInbox(deps);
    const body = fake.requests[0]!.body;
    expect(body.output_config?.format).toBeDefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });
});

describe('Sort with Atlas', () => {
  it('proposes an area for every inbox item and changes nothing until approved', async () => {
    const a = store.createTask({ title: 'Order beakers' }).result;
    const b = store.createTask({ title: 'Fix the gutter' }).result;
    const c = store.createTask({ title: 'Something odd' }).result;
    fake.push(
      reply({
        proposals: [
          { taskId: a.id, area: 'chemistry', dueDate: null, size: 's', reason: 'lab supplies' },
          { taskId: b.id, area: 'Home', dueDate: '2026-10-20', size: 'm', reason: 'house repair' },
          { taskId: c.id, area: 'Astrology', dueDate: null, size: null, reason: 'unclear' },
        ],
      }),
    );
    const before = JSON.stringify(store.listTasks({ view: 'inbox' }));
    const out = await sortInbox(deps);

    expect(out.proposals).toHaveLength(3);
    expect(out.proposals.map((p) => p.areaName)).toEqual(['Chemistry', 'Home', null]);
    expect(out.proposals[1]).toMatchObject({ dueDate: '2026-10-20', size: 'm' });
    // Nothing changed, nothing logged.
    expect(JSON.stringify(store.listTasks({ view: 'inbox' }))).toBe(before);
    expect(store.listAtlasChanges()).toEqual([]);

    const done = applySort(deps, {
      items: out.proposals
        .filter((p) => p.taskId !== c.id)
        .map((p) => ({ taskId: p.taskId, areaId: p.areaId, dueDate: p.dueDate, size: p.size })),
    });
    expect(done.logIds).toHaveLength(2);
    expect(store.getTask(a.id)).toMatchObject({ areaId: area('Chemistry').id, status: 'todo' });
    expect(store.getTask(b.id)).toMatchObject({ areaId: area('Home').id, dueDate: '2026-10-20' });
    expect(store.getTask(c.id)?.status).toBe('inbox');
    // Each one can be undone.
    store.undo(done.logIds[0]!);
    expect(store.listAtlasChanges().filter((e) => !e.undone)).toHaveLength(1);
  });

  it('covers an item the model forgot, and ignores ids it made up', async () => {
    const a = store.createTask({ title: 'Real one' }).result;
    fake.push(
      reply({
        proposals: [{ taskId: 'nonsense', area: 'Home', dueDate: null, size: null, reason: 'x' }],
      }),
    );
    const out = await sortInbox(deps);
    expect(out.proposals.map((p) => [p.taskId, p.areaId])).toEqual([[a.id, null]]);
  });

  it('never proposes a date in the past', async () => {
    const a = store.createTask({ title: 'Old' }).result;
    fake.push(
      reply({
        proposals: [{ taskId: a.id, area: null, dueDate: '2026-01-01', size: null, reason: 'x' }],
      }),
    );
    expect((await sortInbox(deps)).proposals[0]!.dueDate).toBeNull();
  });

  it('makes no call for an empty inbox', async () => {
    expect(await sortInbox(deps)).toEqual({ proposals: [] });
    expect(fake.requests).toHaveLength(0);
  });

  it('shows a reply it cannot read as a plain message', async () => {
    store.createTask({ title: 'x' });
    fake.push({ blocks: [{ type: 'text', text: 'not json' }] });
    await expect(sortInbox(deps)).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('Brain dump', () => {
  const dump =
    'ok so I need to email the principal about the field trip, grade the lab reports for Friday, ' +
    'buy zinc for chem, call mom, and maybe look into a new lab partner system?? also worried about the fire drill';

  it('turns a five-item ramble into an editable checklist and saves nothing', async () => {
    fake.push(
      reply({
        tasks: [
          {
            title: 'Email the principal about the field trip',
            area_guess: 'Admin',
            due_date: null,
            due_time: null,
            size_guess: 's',
            notes: null,
          },
          {
            title: 'Grade lab reports',
            area_guess: 'chemistry',
            due_date: '2026-10-16',
            due_time: null,
            size_guess: 'l',
            notes: null,
          },
          {
            title: 'Buy zinc',
            area_guess: 'Chemistry',
            due_date: null,
            due_time: null,
            size_guess: 's',
            notes: null,
          },
          {
            title: 'Call mom',
            area_guess: 'Personal',
            due_date: null,
            due_time: null,
            size_guess: 's',
            notes: null,
          },
          {
            title: 'Look into a lab partner system',
            area_guess: 'Underwater Basketry',
            due_date: null,
            due_time: null,
            size_guess: 'm',
            notes: 'maybe',
          },
        ],
        unparsed: ['worried about the fire drill'],
      }),
    );
    const out = await brainDump(deps, dump);
    expect(out.tasks).toHaveLength(5);
    expect(out.tasks.map((t) => t.areaId)).toEqual([
      area('Admin').id,
      area('Chemistry').id,
      area('Chemistry').id,
      area('Personal').id,
      null,
    ]);
    expect(out.tasks[1]).toMatchObject({ dueDate: '2026-10-16', size: 'l' });
    expect(out.unparsed).toEqual(['worried about the fire drill']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 0 });
  });

  it('adds exactly what the user left ticked, after edits, and each can be undone', async () => {
    const added = addBrainDump(deps, {
      tasks: [
        {
          title: 'Grade lab reports (edited)',
          areaId: area('Chemistry').id,
          dueDate: '2026-10-16',
          dueTime: null,
          size: 'l',
          notes: null,
        },
        { title: 'Call mom', areaId: null, dueDate: null, dueTime: null, size: 's', notes: null },
      ],
    });
    expect(added.logIds).toHaveLength(2);
    expect(added.summary).toBe('Added 2 tasks from your brain dump');
    expect(store.search('Grade lab').tasks[0]).toMatchObject({
      title: 'Grade lab reports (edited)',
      source: 'atlas',
    });
    expect(store.listTasks({ view: 'inbox' }).map((t) => t.title)).toEqual(['Call mom']);
    for (const id of added.logIds) store.undo(id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL').get()).toEqual({
      n: 0,
    });
  });

  it("sends the areas to choose from and today's date", async () => {
    fake.push(reply({ tasks: [], unparsed: [] }));
    await brainDump(deps, dump);
    const sent = JSON.stringify(fake.requests[0]!.body.messages);
    expect(sent).toContain('Chemistry, Physics, Geology');
    expect(sent).toContain('2026-10-14');
  });
});

describe('enforcePlan (the Planner rules in code)', () => {
  const base = { nowMinute: 10 * 60, dayStart: '07:00', dayEnd: '22:00', busy: [] };
  const block = (taskId: string, time: string, minutes: number) => ({ taskId, time, minutes });

  it('free time runs from now to the end of the window, less what is scheduled', () => {
    const r = enforcePlan({ ...base, busy: [{ start: 12 * 60, end: 13 * 60 }], proposed: [] });
    expect(r.freeMinutes).toBe(12 * 60 - 60);
    expect(r.planLimitMinutes).toBe(Math.floor((12 * 60 - 60) * (1 - SLACK_FRACTION)));
  });

  it('never plans past the end of the day, before now, or over a busy span', () => {
    const r = enforcePlan({
      ...base,
      busy: [{ start: 11 * 60, end: 12 * 60 }],
      proposed: [
        block('late', '21:45', 30),
        block('past', '09:00', 30),
        block('clash', '11:30', 30),
        block('ok', '13:00', 45),
      ],
    });
    expect(r.accepted).toEqual([block('ok', '13:00', 45)]);
    expect(r.dropped.map((d) => d.taskId).sort()).toEqual(['clash', 'late', 'past']);
  });

  it('keeps at least 20% of the free time open, however much is proposed', () => {
    // Two hours free: at most 96 minutes may be planned, so three of four 30-minute blocks fit.
    const r = enforcePlan({
      ...base,
      nowMinute: 20 * 60,
      proposed: ['20:00', '20:30', '21:00', '21:30'].map((time, i) => block(`x${i}`, time, 30)),
    });
    expect(r.freeMinutes).toBe(120);
    expect(r.plannedMinutes).toBeLessThanOrEqual(96);
    expect(r.plannedMinutes / r.freeMinutes).toBeLessThanOrEqual(0.8);
    expect(r.accepted).toHaveLength(3);
    expect(r.dropped).toHaveLength(1);
  });

  it('drops overlapping and repeated proposals and snaps to five minutes', () => {
    const r = enforcePlan({
      ...base,
      proposed: [block('a', '10:32', 28), block('b', '10:45', 30), block('a', '15:00', 30)],
    });
    expect(r.accepted).toEqual([block('a', '10:30', 30)]);
    expect(r.dropped.map((d) => d.taskId).sort()).toEqual(['a', 'b']);
  });

  it('with the day nearly over, plans nothing', () => {
    const r = enforcePlan({
      ...base,
      nowMinute: 21 * 60 + 58,
      proposed: [block('a', '22:00', 15)],
    });
    expect(r.accepted).toEqual([]);
    expect(r.freeMinutes).toBe(0);
  });

  it('has the size defaults the plan names', () => {
    expect(SIZE_MINUTES).toEqual({ s: 15, m: 45, l: 90 });
  });
});

describe('Plan the rest of today', () => {
  it('leaves 20% of the free time open and stays inside the day window, whatever the model says', async () => {
    now = new Date(2026, 9, 14, 20, 0, 0); // two hours left in the 07:00-22:00 window
    const a = store.createTask({
      title: 'Grade quizzes',
      areaId: area('Chemistry').id,
      dueDate: '2026-10-14',
      size: 'l',
    }).result;
    const b = store.createTask({
      title: 'Plan Friday lab',
      areaId: area('Chemistry').id,
      dueDate: '2026-10-14',
      size: 'm',
    }).result;
    const c = store.createTask({
      title: 'Email parents',
      areaId: area('Admin').id,
      dueDate: '2026-10-14',
      size: 's',
    }).result;
    // A greedy model: tries to fill everything, and runs past the end.
    fake.push(
      reply({
        blocks: [
          { taskId: a.id, time: '20:00', minutes: 60 },
          { taskId: b.id, time: '21:00', minutes: 45 },
          { taskId: c.id, time: '21:45', minutes: 30 },
        ],
        note: 'Everything, back to back.',
      }),
    );
    const plan = await planRestOfToday(deps);
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    expect(plan.freeMinutes).toBe(120);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(96);
    for (const blk of plan.blocks)
      expect(mins(blk.time) + blk.minutes).toBeLessThanOrEqual(22 * 60);
    expect(plan.blocks.map((x) => x.taskId)).toEqual([a.id]);
    expect(plan.dropped.map((d) => d.taskId).sort()).toEqual([b.id, c.id].sort());
    // A proposal changes nothing.
    expect(store.getTask(a.id)?.scheduledStart).toBeNull();
    expect(store.listAtlasChanges()).toEqual([]);
  });

  it('plans around blocks that already exist and skips tasks that already have one today', async () => {
    const blocked = store.createTask({
      title: 'Department meeting',
      dueDate: '2026-10-14',
      block: { date: '2026-10-14', time: '11:00', minutes: 60 },
    }).result;
    const t = store.createTask({
      title: 'Write the test',
      areaId: area('Physics').id,
      dueDate: '2026-10-14',
      size: 'm',
    }).result;
    fake.push(
      reply({
        blocks: [
          { taskId: blocked.id, time: '14:00', minutes: 30 },
          { taskId: t.id, time: '11:15', minutes: 45 },
        ],
        note: 'x',
      }),
    );
    const plan = await planRestOfToday(deps);
    expect(plan.blocks).toEqual([]);
    expect(plan.dropped.map((d) => d.reason).join(' ')).toMatch(/overlaps|not on the list/);
    // The prompt told Atlas about the meeting and gave sizes as default minutes.
    const sent = JSON.stringify(fake.requests[0]!.body.messages);
    expect(sent).toContain('Department meeting');
    expect(sent).toContain('suggestedMinutes');
  });

  it('applying the accepted blocks sets time blocks today, and Undo takes them back', async () => {
    const t = store.createTask({
      title: 'Write the test',
      areaId: area('Physics').id,
      dueDate: '2026-10-14',
      size: 'm',
    }).result;
    fake.push(reply({ blocks: [{ taskId: t.id, time: '13:00', minutes: 45 }], note: 'Midday.' }));
    const plan = await planRestOfToday(deps);
    expect(plan.blocks).toHaveLength(1);
    const done = applyPlan(deps, {
      blocks: plan.blocks.map(({ taskId, time, minutes }) => ({ taskId, time, minutes })),
    });
    const after = store.getTask(t.id)!;
    expect(after.scheduledMinutes).toBe(45);
    expect(store.getToday({ dayStart: '07:00', dayEnd: '22:00' }).blocks).toHaveLength(1);
    store.undo(done.logIds[0]!);
    expect(store.getTask(t.id)?.scheduledStart).toBeNull();
  });
});
