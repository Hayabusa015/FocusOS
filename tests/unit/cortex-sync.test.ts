import { describe, expect, it } from 'vitest';
import { draftOf, planCortexSync } from '../../src/main/google/cortex-sync';
import type { BlockTask, Mirror } from '../../src/main/google/cortex-sync';
import type { RemoteEvent } from '../../src/main/google/types';

const iso = (h: number, m = 0, day = 14) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();

const task = (over: Partial<BlockTask> = {}): BlockTask => ({
  id: 't1',
  title: 'Grade lab reports',
  status: 'todo',
  startIso: iso(14),
  minutes: 45,
  updatedAt: iso(9),
  ...over,
});

const event = (over: Partial<RemoteEvent> = {}): RemoteEvent => ({
  id: 'e1',
  calendarId: 'cortex-cal',
  title: 'Grade lab reports',
  start: iso(14),
  end: iso(14, 45),
  allDay: false,
  etag: 'etag-1',
  updated: iso(9),
  cortexTaskId: 't1',
  cancelled: false,
  ...over,
});

const mirror = (over: Partial<Mirror> = {}): Mirror => ({
  googleId: 'e1',
  etag: 'etag-1',
  syncedAt: iso(10),
  ...over,
});

const plan = (tasks: BlockTask[], remote: RemoteEvent[], mirrors: [string, Mirror][] = []) =>
  planCortexSync({ tasks, remote, mirrors: new Map(mirrors) });

const empty = { insert: [], patch: [], remove: [], pull: [], clearBlock: [], dropRows: [] };

describe('Cortex calendar sync (PLAN §9.3)', () => {
  it('scheduling a task creates an event for it', () => {
    const p = plan([task()], []);
    expect(p.insert).toEqual([{ taskId: 't1', draft: draftOf(task()) }]);
    expect(p.insert[0]!.draft).toMatchObject({
      title: 'Grade lab reports',
      cortexTaskId: 't1',
      end: iso(14, 45),
    });
  });

  it('does nothing when both sides agree', () => {
    expect(plan([task()], [event()], [['t1', mirror()]])).toEqual(empty);
  });

  it('moving the block in Cortex moves the event', () => {
    const moved = task({ startIso: iso(15), updatedAt: iso(11) });
    const p = plan([moved], [event()], [['t1', mirror()]]);
    expect(p.patch).toEqual([{ taskId: 't1', eventId: 'e1', draft: draftOf(moved) }]);
    expect(p.pull).toEqual([]);
  });

  it('moving the event in Google moves the block in Cortex', () => {
    const moved = event({ start: iso(16), end: iso(16, 30), etag: 'etag-2', updated: iso(11) });
    const p = plan([task()], [moved], [['t1', mirror()]]);
    expect(p.pull).toEqual([{ taskId: 't1', startIso: iso(16), minutes: 30 }]);
    expect(p.patch).toEqual([]);
  });

  it('when both sides moved, the newer one wins', () => {
    const base = [['t1', mirror()]] as [string, Mirror][];
    const googleNewer = plan(
      [task({ startIso: iso(15), updatedAt: iso(11) })],
      [event({ start: iso(16), end: iso(16, 45), etag: 'etag-2', updated: iso(12) })],
      base,
    );
    expect(googleNewer.pull).toHaveLength(1);
    expect(googleNewer.patch).toHaveLength(0);

    const cortexNewer = plan(
      [task({ startIso: iso(15), updatedAt: iso(13) })],
      [event({ start: iso(16), end: iso(16, 45), etag: 'etag-2', updated: iso(12) })],
      base,
    );
    expect(cortexNewer.patch).toHaveLength(1);
    expect(cortexNewer.pull).toHaveLength(0);
  });

  it('a Google change that leaves the times and title alone (a colour, say) does nothing', () => {
    const p = plan([task()], [event({ etag: 'etag-9' })], [['t1', mirror()]]);
    expect(p).toEqual(empty);
  });

  it('an event deleted in Google clears the block, and a finished task just forgets it', () => {
    const open = plan([task()], [], [['t1', mirror()]]);
    expect(open.clearBlock).toEqual([{ taskId: 't1' }]);
    expect(open.dropRows).toEqual([{ googleId: 'e1' }]);
    expect(open.insert).toEqual([]);

    const done = plan([task({ status: 'done' })], [], [['t1', mirror()]]);
    expect(done.clearBlock).toEqual([]);
    expect(done.dropRows).toEqual([{ googleId: 'e1' }]);
  });

  it('does not create events for finished tasks that were never mirrored', () => {
    expect(plan([task({ status: 'done' })], [])).toEqual(empty);
  });

  it('leaves a finished task’s event alone even if the times differ', () => {
    const p = plan(
      [task({ status: 'done', startIso: iso(15), updatedAt: iso(11) })],
      [event()],
      [['t1', mirror()]],
    );
    expect(p).toEqual(empty);
  });

  it('removes an event Cortex made for a task that is gone, and never touches other events', () => {
    const orphan = event({ id: 'e2', cortexTaskId: 'gone' });
    const byHand = event({ id: 'e3', cortexTaskId: null, title: 'Added in Google' });
    const p = plan([task()], [event(), orphan, byHand], [['t1', mirror()]]);
    expect(p.remove).toEqual([{ eventId: 'e2' }]);
    expect(p.patch).toEqual([]);
  });

  it('removes a duplicate event for the same task', () => {
    const p = plan([task()], [event(), event({ id: 'e9' })], [['t1', mirror()]]);
    expect(p.remove).toEqual([{ eventId: 'e9' }]);
  });

  it('a renamed task updates the title in Google, and a title edited in Google is put back', () => {
    const renamed = plan(
      [task({ title: 'Grade the lab reports', updatedAt: iso(11) })],
      [event()],
      [['t1', mirror()]],
    );
    expect(renamed.patch).toHaveLength(1);

    const edited = plan(
      [task()],
      [event({ title: 'Something else', etag: 'etag-2', updated: iso(11) })],
      [['t1', mirror()]],
    );
    expect(edited.patch).toHaveLength(1);
    expect(edited.pull).toEqual([]);
  });

  it('does not turn an all-day or absurdly short event into a block', () => {
    const allDay = plan(
      [task()],
      [
        event({
          allDay: true,
          start: '2026-10-14',
          end: '2026-10-15',
          etag: 'etag-2',
          updated: iso(11),
        }),
      ],
      [['t1', mirror()]],
    );
    expect(allDay.pull).toEqual([]);
    expect(allDay.patch).toHaveLength(1);

    const tiny = plan(
      [task()],
      [event({ start: iso(16), end: iso(16, 2), etag: 'etag-2', updated: iso(11) })],
      [['t1', mirror()]],
    );
    expect(tiny.pull).toEqual([]);
    expect(tiny.patch).toHaveLength(1);
  });

  it('adopts an event it has no record of (a fresh install) by the newer side', () => {
    const moved = { start: iso(16), end: iso(16, 45), updated: iso(9) };
    expect(plan([task({ updatedAt: iso(8) })], [event(moved)]).pull).toHaveLength(1);
    expect(plan([task({ updatedAt: iso(10) })], [event(moved)]).patch).toHaveLength(1);
  });

  it('running it again after its own changes is a no-op (nothing bounces between the sides)', () => {
    const moved = task({ startIso: iso(15), updatedAt: iso(11) });
    const first = plan([moved], [event()], [['t1', mirror()]]);
    expect(first.patch).toHaveLength(1);
    // After the patch: Google has the new time and a new etag; the mirror was written at the read time.
    const after = event({ start: iso(15), end: iso(15, 45), etag: 'etag-2', updated: iso(11, 1) });
    const second = plan(
      [moved],
      [after],
      [['t1', mirror({ etag: 'etag-2', syncedAt: iso(11, 0) })]],
    );
    expect(second).toEqual(empty);
  });
});
