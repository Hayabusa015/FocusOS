/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { emptyFakeState } from '../../src/main/google/fake';
import type { FakeMail, FakeState } from '../../src/main/google/fake';
import type { RemoteEvent } from '../../src/main/google/types';

const root = resolve(__dirname, '../..');
const KEY = 'sk-ant-e2e-test-key-0123456789';
const dataDirs: string[] = [];

/** A moment today, in the PC's own time zone, as the UTC instant Google would send. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayAt = (hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const event = (
  over: Partial<RemoteEvent> & Pick<RemoteEvent, 'id' | 'calendarId' | 'title'>,
): RemoteEvent => ({
  start: todayAt(8),
  end: todayAt(9),
  allDay: false,
  etag: 'e',
  updated: new Date().toISOString(),
  cortexTaskId: null,
  cancelled: false,
  ...over,
});

/** The pretend Google is a JSON file in the data folder: a test changes "Google" by editing it. */
const fakeFile = (dataDir: string) => join(dataDir, 'fake-google.json');
const readFake = (dataDir: string): FakeState =>
  JSON.parse(readFileSync(fakeFile(dataDir), 'utf8')) as FakeState;
const writeFake = (dataDir: string, fn: (s: FakeState) => void) => {
  let state: FakeState;
  try {
    state = readFake(dataDir);
  } catch {
    state = emptyFakeState();
  }
  fn(state);
  writeFileSync(fakeFile(dataDir), JSON.stringify(state, null, 2));
};

async function launch(
  seed?: (s: FakeState) => void,
): Promise<{ app: ElectronApplication; page: Page; errors: string[]; dataDir: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-google-'));
  dataDirs.push(dataDir);
  if (seed) writeFake(dataDir, seed);
  const app = await electron.launch({
    cwd: root,
    args: ['.', '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      CORTEX_DATA_DIR: dataDir,
      CORTEX_TEST_ATLAS: 'fake',
      CORTEX_TEST_GOOGLE: 'fake',
    },
  });
  await app.firstWindow();
  let page: Page | undefined;
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find((w) => !w.url().includes('#/capture') && w.url() !== '');
    if (!page) await new Promise((done) => setTimeout(done, 100));
  }
  if (!page) throw new Error('The main window did not open');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  const due = await page.evaluate(() => window.cortex.rituals.state().then((r) => r.briefingDue));
  if (due) {
    await page.getByTestId('briefing').getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('briefing')).toHaveCount(0);
  }
  return { app, page, errors, dataDir };
}

const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });

async function connect(page: Page) {
  await nav(page, /^Settings/).click();
  await page.getByLabel('Google client ID').fill('e2e-client.apps.googleusercontent.com');
  await page.getByLabel('Google client secret').fill('GOCSPX-e2e-secret');
  await page.getByTestId('google-connect').click();
  await expect(page.getByTestId('google-status')).toContainText('Connected as teacher@example.com');
}

const setKey = (page: Page) =>
  page.evaluate(async (key) => {
    const r = await window.cortex.atlas.setKey(key);
    if (!r.ok) throw new Error(r.error);
  }, KEY);

test.afterAll(() => dataDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('with Google not connected, Settings says so and the rest of the app works', async () => {
  const { app, page, errors } = await launch();
  try {
    await nav(page, /^Settings/).click();
    await expect(page.getByTestId('google-status')).toContainText('Not connected');
    await expect(page.getByTestId('google-status')).toContainText('works fully without Google');
    // The sign-in button waits for both fields.
    await expect(page.getByTestId('google-connect')).toBeDisabled();

    await nav(page, /^Today/).click();
    await expect(page.getByTestId('calendar-event')).toHaveCount(0);
    await expect(page.getByTestId('email-suggestions')).toHaveCount(0);
    await page.evaluate(() => window.cortex.tasks.create({ title: 'Works without Google' }));
    await nav(page, /^Inbox/).click();
    await expect(page.getByRole('button', { name: 'Works without Google' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('sign in, choose calendars, and events appear on Today in their own style', async () => {
  const { app, page, errors } = await launch((s) => {
    s.events.push(
      event({ id: 'dentist', calendarId: 'primary-cal', title: 'Dentist' }),
      event({
        id: 'soccer',
        calendarId: 'family-cal',
        title: 'Soccer practice',
        start: todayAt(17),
        end: todayAt(18, 30),
      }),
    );
  });
  try {
    await connect(page);
    const calendars = page.getByTestId('google-calendars');
    await expect(calendars).toContainText('Personal');
    await expect(calendars).toContainText('time blocks are written here, and only here');
    await expect(page.getByRole('switch', { name: 'Show Personal' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Show Family' })).not.toBeChecked();

    await nav(page, /^Today/).click();
    await expect(page.getByTestId('calendar-event')).toHaveCount(1);
    await expect(page.getByTestId('calendar-event')).toContainText('Dentist');

    // Turning another calendar on brings its events in; the event is not a task.
    await nav(page, /^Settings/).click();
    await page.getByRole('switch', { name: 'Show Family' }).check();
    await nav(page, /^Today/).click();
    await expect(page.getByTestId('calendar-event')).toHaveCount(2);
    await expect(page.getByTestId('calendar-event').nth(1)).toContainText('Soccer practice');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('a time block is mirrored to the Cortex calendar only, and moving it in Google moves it back', async () => {
  const { app, page, errors, dataDir } = await launch();
  try {
    await connect(page);
    const id = await page.evaluate(
      async (date) =>
        (
          await window.cortex.tasks.create({
            title: 'Grade lab reports',
            block: { date, time: '15:00', minutes: 30 },
          })
        ).id,
      today(),
    );

    // The event appears in Google's Cortex calendar, and nothing was written anywhere else.
    await expect
      .poll(() => readFake(dataDir).events.filter((e) => e.cortexTaskId === id).length, {
        timeout: 15_000,
      })
      .toBe(1);
    let fake = readFake(dataDir);
    expect(fake.writes.length).toBeGreaterThan(0);
    expect(fake.writes.every((w) => w.calendarId === 'cortex-cal')).toBe(true);
    const mirrored = fake.events.find((e) => e.cortexTaskId === id)!;
    expect(mirrored).toMatchObject({ calendarId: 'cortex-cal', title: 'Grade lab reports' });
    expect(new Date(mirrored.end).getTime() - new Date(mirrored.start).getTime()).toBe(30 * 60_000);

    // Moved in Google: the next sync moves the block in Cortex.
    writeFake(dataDir, (s) => {
      const e = s.events.find((x) => x.cortexTaskId === id)!;
      e.start = todayAt(16, 30);
      e.end = todayAt(17, 15);
      e.etag = 'moved-in-google';
      e.updated = new Date(Date.now() + 60_000).toISOString();
    });
    await nav(page, /^Settings/).click();
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(async (taskId) => {
            const t = (await window.cortex.tasks.get(taskId))?.task;
            return t?.scheduledStart
              ? new Date(t.scheduledStart).getHours() * 60 + new Date(t.scheduledStart).getMinutes()
              : null;
          }, id),
        { timeout: 15_000 },
      )
      .toBe(16 * 60 + 30);
    const minutes = await page.evaluate(
      async (taskId) => (await window.cortex.tasks.get(taskId))?.task.scheduledMinutes,
      id,
    );
    expect(minutes).toBe(45);

    // Still only ever the Cortex calendar.
    fake = readFake(dataDir);
    expect(fake.writes.every((w) => w.calendarId === 'cortex-cal')).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('email suggestions: Atlas proposes, nothing is a task until Accept, and no message comes back twice', async () => {
  const message = (id: string, subject: string): FakeMail => ({
    id,
    from: 'Principal <principal@school.example>',
    subject,
    date: new Date(Date.now() - 3600_000).toISOString(),
    snippet: 'A short snippet.',
    labels: ['INBOX'],
  });
  const { app, page, errors, dataDir } = await launch((s) => {
    s.mail = [
      message('m1', 'Please sign the field trip form'),
      message('m2', 'Weekly digest from the district'),
    ];
  });
  try {
    await connect(page);
    // Without an Atlas key it says what is missing.
    await page.getByRole('button', { name: 'Check email' }).click();
    await expect(page.getByRole('alert')).toContainText('Atlas key');

    await setKey(page);
    await page.getByRole('button', { name: 'Check email' }).click();
    await expect(page.getByTestId('google-note')).toContainText('1 new suggestion');

    await nav(page, /^Inbox/).click();
    const card = page.getByTestId('email-suggestion');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Please sign the field trip form');
    // Nothing is a task yet.
    expect(await page.evaluate(() => window.cortex.tasks.list({ view: 'inbox' }))).toHaveLength(0);

    // Edit, then accept: the task is made once, from email, and the card goes.
    await card.getByLabel('Task title').fill('Sign the field trip form (edited)');
    await card.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByTestId('email-suggestions')).toHaveCount(0);
    const tasks = await page.evaluate(async () => [
      ...(await window.cortex.tasks.list({ view: 'inbox' })),
      ...(await window.cortex.areas
        .list(false)
        .then((areas) =>
          Promise.all(areas.map((a) => window.cortex.tasks.list({ view: 'area', areaId: a.id }))),
        )
        .then((lists) => lists.flat())),
    ]);
    expect(tasks.filter((t) => t.title === 'Sign the field trip form (edited)')).toHaveLength(1);
    expect(tasks.find((t) => t.title.startsWith('Sign the field'))!.source).toBe('email');

    // Checking again never brings the same message back.
    await nav(page, /^Settings/).click();
    await page.getByRole('button', { name: 'Check email' }).click();
    await expect(page.getByTestId('google-note')).toContainText('Nothing new');
    await nav(page, /^Inbox/).click();
    await expect(page.getByTestId('email-suggestions')).toHaveCount(0);

    // Only headers and the snippet were ever requested.
    const fake = readFake(dataDir);
    expect(new Set(fake.mailCalls.map((c) => c.op))).toEqual(new Set(['list', 'meta']));
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('when Google refuses Gmail, Calendar still works and Settings says so', async () => {
  const { app, page, errors } = await launch((s) => {
    s.gmailDenied = true;
    s.events.push(event({ id: 'dentist', calendarId: 'primary-cal', title: 'Dentist' }));
  });
  try {
    await connect(page);
    await expect(page.getByTestId('google-gmail-status')).toContainText(
      'Google did not allow Cortex to read Gmail',
    );
    await nav(page, /^Today/).click();
    await expect(page.getByTestId('calendar-event')).toContainText('Dentist');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('disconnecting forgets the sign-in and the cached events, and the app carries on', async () => {
  const { app, page, errors, dataDir } = await launch((s) => {
    s.events.push(event({ id: 'dentist', calendarId: 'primary-cal', title: 'Dentist' }));
  });
  try {
    await connect(page);
    const id = await page.evaluate(
      async (date) =>
        (
          await window.cortex.tasks.create({
            title: 'Keep this block',
            block: { date, time: '15:00', minutes: 30 },
          })
        ).id,
      today(),
    );
    await expect
      .poll(() => readFake(dataDir).events.filter((e) => e.cortexTaskId === id).length, {
        timeout: 15_000,
      })
      .toBe(1);

    await page.getByTestId('google-disconnect').click();
    await page.getByTestId('google-disconnect-confirm').click();
    await expect(page.getByTestId('google-status')).toContainText('Not connected');
    await nav(page, /^Today/).click();
    await expect(page.getByTestId('calendar-event')).toHaveCount(0);
    // The task and its block are still there, and the Cortex calendar in Google was left alone.
    const block = await page.evaluate(
      async (taskId) => (await window.cortex.tasks.get(taskId))?.task.scheduledStart,
      id,
    );
    expect(block).not.toBeNull();
    expect(readFake(dataDir).events.some((e) => e.cortexTaskId === id)).toBe(true);
    await page.evaluate(() => window.cortex.tasks.create({ title: 'Still works' }));
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
