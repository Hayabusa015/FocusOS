/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { nextPatchVersion } from '../../src/main/updater-fake';

const root = resolve(__dirname, '../..');
// The `electron` package exports the path to the Electron binary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath = require('electron') as unknown as string;
// The versions under test come from package.json, so a version bump never breaks the tests.
const VERSION = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
const NEXT = nextPatchVersion(VERSION);
const dataDirs: string[] = [];

async function mainWindow(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find((w) => !w.url().includes('#/capture') && w.url() !== '');
    if (found) return found;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('The main window did not open');
}

async function launch(
  dataDir: string,
  extraEnv: Record<string, string> = {},
  options: { keepBriefing?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    cwd: root,
    args: ['.', '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, CORTEX_DATA_DIR: dataDir, ...extraEnv },
  });
  // The hidden quick-capture window is created at start-up too; the tests drive the main window.
  await app.firstWindow();
  const page = await mainWindow(app);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  // The morning briefing opens over everything on the first start after 5:00. Most tests are about
  // something else, so they dismiss it, which also marks it shown for the day.
  if (!options.keepBriefing) {
    const due = await page.evaluate(() => window.cortex.rituals.state().then((r) => r.briefingDue));
    if (due) {
      await page.getByTestId('briefing').getByRole('button', { name: 'Not now' }).click();
      await expect(page.getByTestId('briefing')).toHaveCount(0);
    }
  }
  return { app, page, errors };
}

test.afterAll(() => dataDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('opens on an empty dashboard and shows the installed version in Settings', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const { app, page, errors } = await launch(dataDir);
  try {
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Still up/ }),
    ).toBeVisible();
    await expect(page.getByText("Nothing on today's list yet")).toBeVisible();
    await expect(page.getByTestId('tile-inbox')).toContainText('0');
    await page.screenshot({ path: 'test-results/today.png' });

    await expect(page.getByTestId('sidebar-version')).toHaveText(`Version ${VERSION}`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByTestId('installed-version')).toHaveText(VERSION);
    // A development build never checks for updates, and says why.
    await expect(page.getByTestId('update-status')).toHaveText('Off');
    await expect(page.getByText('Updates are checked only in the installed app.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    await expect(page.getByText(dataDir)).toBeVisible();
    await page.screenshot({ path: 'test-results/settings.png' });

    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('the renderer is sandboxed: no Node, no require, only the Cortex API', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const { app, page } = await launch(dataDir);
  try {
    await page.getByRole('heading').first().waitFor();
    const seen = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)['require'],
      process: typeof (globalThis as Record<string, unknown>)['process'],
      electron: typeof (globalThis as Record<string, unknown>)['electron'],
      cortexKeys: Object.keys((globalThis as { cortex?: object }).cortex ?? {}).sort(),
    }));
    expect(seen).toEqual({
      require: 'undefined',
      process: 'undefined',
      electron: 'undefined',
      cortexKeys: [
        'accomplishments',
        'app',
        'areas',
        'atlas',
        'capture',
        'focus',
        'maintenance',
        'onDataChanged',
        'rituals',
        'search',
        'settings',
        'tasks',
        'today',
        'undo',
        'upcoming',
        'updater',
        'voice',
      ],
    });

    // The strict policy blocks inline script and outside connections. (Playwright's own evaluate
    // is exempt from the eval rule, so this injects a real inline script and watches for the
    // browser's policy-violation events instead.)
    const policy = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.violatedDirective),
      );
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true';
      document.head.appendChild(script);
      await fetch('https://example.com').catch(() => undefined);
      await new Promise((done) => setTimeout(done, 100));
      return {
        inlineRan: (window as unknown as { __inlineRan?: boolean }).__inlineRan === true,
        violations,
      };
    });
    expect(policy.inlineRan).toBe(false);
    expect(policy.violations.some((v) => v.startsWith('script-src'))).toBe(true);
    expect(policy.violations).toContain('connect-src');

    const info = await page.evaluate(() => window.cortex.app.info());
    expect(info).toMatchObject({ name: 'Cortex', version: VERSION, dataDir, isPackaged: false });

    const settings = await page.evaluate(() => window.cortex.updater.getState());
    expect(settings).toMatchObject({ status: 'disabled', currentVersion: VERSION });

    // A request that does not match its schema is refused by the main process.
    const refused = await page.evaluate(() =>
      window.cortex.updater.snooze('').then(
        () => 'accepted',
        (e: Error) => e.message,
      ),
    );
    expect(refused).toMatch(/Invalid request/);
  } finally {
    await app.close();
  }
});

test('creates its database on first run and remembers the version that ran', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const { app } = await launch(dataDir);
  await app.close();

  expect(existsSync(join(dataDir, 'cortex.db'))).toBe(true);
  expect(existsSync(join(dataDir, 'logs', 'cortex.log'))).toBe(true);
  const db = new DatabaseSync(join(dataDir, 'cortex.db'));
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app.lastRunVersion'").get() as {
    value: string;
  };
  expect(JSON.parse(row.value)).toBe(VERSION);
  const versions = db.prepare('SELECT version FROM schema_migrations').all();
  expect(versions.length).toBeGreaterThan(0);
  db.close();
});

test('refuses to start on a database from a newer Cortex and leaves it untouched', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const first = await launch(dataDir);
  await first.app.close();

  const db = new DatabaseSync(join(dataDir, 'cortex.db'));
  db.prepare(
    "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (999, 'from_the_future', 'x', '2099-01-01T00:00:00Z')",
  ).run();
  db.close();

  const run = spawnSync(electronPath, ['.', '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: { ...process.env, CORTEX_DATA_DIR: dataDir, CORTEX_TEST: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('saved by a newer version of Cortex');
  expect(run.stderr).toContain('Your data has not been changed');

  const after = new DatabaseSync(join(dataDir, 'cortex.db'));
  const top = after.prepare('SELECT MAX(version) v FROM schema_migrations').get() as { v: number };
  expect(top.v).toBe(999);
  after.close();
});

test('the update flow: banner, safe notes, Later, download, backup, restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const { app, page, errors } = await launch(dataDir, { CORTEX_TEST_UPDATER: 'fake' });
  try {
    // Put something in the data so "data intact" means something.
    const marker = new DatabaseSync(join(dataDir, 'cortex.db'));
    marker.prepare("INSERT INTO settings (key, value) VALUES ('test.marker', '\"kept\"')").run();
    marker.close();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Check for updates' }).click();

    const banner = page.getByRole('status', { name: 'Update' });
    await expect(banner.getByText(`Cortex ${NEXT} is available.`)).toBeVisible();
    await page.screenshot({ path: 'test-results/update-available.png' });

    // What's new: formatted, with nothing dangerous surviving.
    await banner.getByRole('button', { name: "What's new" }).click();
    await expect(banner.getByText('A harmless change')).toBeVisible();
    await expect(banner.getByText('the notes')).toBeVisible();
    expect(await banner.locator('a, script, img').count()).toBe(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __notesScriptRan?: boolean }).__notesScriptRan,
      ),
    ).toBeUndefined();
    await page.screenshot({ path: 'test-results/update-notes.png' });

    // Later hides it for 24 hours; Settings still reports it.
    await banner.getByRole('button', { name: 'Later' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByText(NEXT, { exact: true })).toBeVisible();
    // A manual check brings it back.
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await expect(banner.getByText(`Cortex ${NEXT} is available.`)).toBeVisible();

    // Update now: progress, then ready to restart, and the data is backed up before install.
    await banner.getByRole('button', { name: 'Update now' }).click();
    await expect(banner.getByText(`Cortex ${NEXT} is ready to install.`)).toBeVisible();
    await page.screenshot({ path: 'test-results/update-ready.png' });
    const backup = join(dataDir, 'backups', `pre-update-${VERSION}-to-${NEXT}.db`);
    expect(existsSync(backup)).toBe(true);
    const copy = new DatabaseSync(backup);
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'test.marker'").get()).toEqual({
      value: '"kept"',
    });
    copy.close();

    // Restart to install hands over to the installer (here: leaves a marker and quits).
    const closed = new Promise<void>((done) => app.process().once('exit', () => done()));
    await banner.getByRole('button', { name: 'Restart to install' }).click();
    await closed;
    expect(existsSync(join(dataDir, 'fake-install-called'))).toBe(true);
    expect(
      errors.filter((e) => !/Target page, context or browser has been closed/.test(e)),
    ).toEqual([]);
  } finally {
    await app.close().catch(() => undefined);
  }
});

// --- Phase 1: core tasks -------------------------------------------------------------------

const newDataDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(d);
  return d;
};

test('capture window: Enter puts the task in the Inbox in under a second; Esc saves nothing', async () => {
  const { app, page, errors } = await launch(newDataDir());
  try {
    const capture = app.windows().find((w) => w.url().includes('#/capture'));
    expect(capture, 'the hidden capture window exists').toBeTruthy();
    const box = capture!.getByLabel('Capture a task');

    await box.fill('thrown away');
    await box.press('Escape');
    expect(await page.evaluate(() => window.cortex.tasks.list({ view: 'inbox' }))).toHaveLength(0);

    await box.fill('Grade the quizzes #chemistry !tomorrow');
    const started = Date.now();
    await box.press('Enter');
    let found = false;
    while (Date.now() - started < 1000 && !found) {
      const areas = await page.evaluate(() => window.cortex.areas.list());
      const chem = areas.find((a) => a.name === 'Chemistry')!;
      const tasks = await page.evaluate(
        (id) => window.cortex.tasks.list({ view: 'area', areaId: id }),
        chem.id,
      );
      found = tasks.some((t) => t.title === 'Grade the quizzes' && t.dueDate !== null);
    }
    expect(found, 'saved with its area and due date within 1 s').toBe(true);

    await box.fill('plain thought');
    await box.press('Enter');
    await expect(page.getByTestId('inbox-count')).toHaveText('1');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('the capture shortcut is registered with the system', async () => {
  const { app } = await launch(newDataDir());
  try {
    const registered = await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered('Control+Alt+N'),
    );
    // Linux test machines may refuse global shortcuts; Windows is checked by hand.
    test.skip(!registered && process.platform !== 'win32', 'no global shortcuts in this session');
    expect(registered).toBe(true);
  } finally {
    await app.close();
  }
});

test('capture, file, complete, undo; areas are seeded once', async () => {
  const dataDir = newDataDir();
  const first = await launch(dataDir);
  try {
    const { page, errors } = first;
    expect((await page.evaluate(() => window.cortex.areas.list())).map((a) => a.name)).toEqual([
      'Chemistry',
      'Physics',
      'Geology',
      'Coaching',
      'Home',
      'Admin',
      'Personal',
    ]);
    await page.evaluate(() => window.cortex.capture.submit('Order lab goggles'));

    await page.getByRole('navigation').getByRole('button', { name: 'Inbox' }).click();
    await expect(page.getByRole('button', { name: 'Order lab goggles' })).toBeVisible();
    await page.getByRole('button', { name: 'File in Physics' }).click();
    await expect(page.getByText('Inbox is empty')).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: 'Physics' }).click();
    const row = page.getByTestId('task-row').filter({ hasText: 'Order lab goggles' });
    await row.getByRole('checkbox').click();
    await expect(page.getByTestId('area-progress')).toContainText('1 done this week');
    await expect(page.getByTestId('toast-text')).toContainText('Completed');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('area-progress')).toContainText('0 done this week');

    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }
  // A second start does not seed the areas again.
  const second = await launch(dataDir);
  try {
    expect(await second.page.evaluate(() => window.cortex.areas.list())).toHaveLength(7);
  } finally {
    await second.app.close();
  }
});

test('a repeating task makes its next instance; undo takes it back', async () => {
  const { app, page } = await launch(newDataDir());
  try {
    const result = await page.evaluate(async () => {
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const due = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const made = await window.cortex.tasks.create({
        title: 'Weekly report',
        dueDate: due,
        recurrence: { freq: 'every_n_days', n: 7 },
      });
      const done = await window.cortex.tasks.complete(made.id);
      const log = await window.cortex.undo.list();
      await window.cortex.undo.apply(log[0]!.id);
      const after = await window.cortex.tasks.get(done.next!.id);
      return { due, next: done.next?.dueDate, nextAfterUndo: after };
    });
    expect(result.next).not.toBe(result.due);
    expect(result.nextAfterUndo).toBeNull();
  } finally {
    await app.close();
  }
});

test('home maintenance: starting point, Done restarts the clock, undo reverses', async () => {
  const { app, page, errors } = await launch(newDataDir());
  try {
    await page.getByRole('button', { name: 'Home maintenance' }).click();
    await page.getByRole('button', { name: '+ Replace the HVAC air filter' }).click();
    const card = page.getByRole('region', { name: 'Replace the HVAC air filter' });
    await expect(card).toContainText('Not done yet');
    await card.getByRole('button', { name: 'Done' }).click();
    await expect(card).toContainText('Done today');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card).toContainText('Not done yet');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

// --- Daily list, dashboard, drag and steps --------------------------------------------------

test('dashboard and daily list: add to today, tick, steps indent, reorder, undo', async () => {
  const { app, page, errors } = await launch(newDataDir());
  try {
    // Dashboard is the home screen, and the daily list is on it.
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Still up/ }),
    ).toBeVisible();
    const list = page.getByTestId('daily-list');
    const add = list.getByPlaceholder('Add to today and press Enter');
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await add.fill(title);
      await add.press('Enter');
      await expect(list.locator('button.min-w-0', { hasText: title })).toBeVisible();
    }
    await expect(page.getByTestId('tile-due')).toContainText('3');

    // Tick one: it moves to Done, struck through, and the tile counts it.
    await list.getByRole('checkbox', { name: 'Complete Alpha' }).click();
    await expect(list.getByTestId('task-row-done')).toContainText('Alpha');
    await expect(page.getByTestId('tile-today')).toContainText('1 of 3');

    // Indent Gamma under Beta with the button; Beta shows a step count and a nested row.
    await list.getByRole('button', { name: 'Indent Gamma' }).click();
    await expect(list.getByRole('button', { name: 'Outdent Gamma' })).toBeVisible();
    await expect(list).toContainText('0/1 steps');

    // Outdent brings it back to the main list.
    await list.getByRole('button', { name: 'Outdent Gamma' }).click();
    await expect(list.getByRole('button', { name: 'Indent Gamma' })).toBeVisible();

    // Keyboard reorder: Alt+Up moves Gamma above Beta.
    const order = () => list.getByTestId('task-row').locator('button.min-w-0').allInnerTexts();
    expect((await order()).map((t) => t.split('\n')[0])).toEqual(['Beta', 'Gamma']);
    await list.locator('button.min-w-0', { hasText: 'Gamma' }).press('Alt+ArrowUp');
    await expect
      .poll(async () => (await order()).map((t) => t.split('\n')[0]))
      .toEqual(['Gamma', 'Beta']);

    // Undo puts the order back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(async () => (await order()).map((t) => t.split('\n')[0]))
      .toEqual(['Beta', 'Gamma']);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('drag a task by its handle to reorder the list', async () => {
  const { app, page } = await launch(newDataDir());
  try {
    await page.evaluate(async () => {
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const due = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      for (const title of ['One', 'Two', 'Three'])
        await window.cortex.tasks.create({ title, dueDate: due });
    });
    const list = page.getByTestId('daily-list');
    const names = async () =>
      (await list.getByTestId('task-row').locator('button.min-w-0').allInnerTexts()).map(
        (t) => t.split('\n')[0],
      );
    await expect.poll(names).toEqual(['One', 'Two', 'Three']);
    const handle = list
      .getByTestId('task-row')
      .filter({ hasText: 'Three' })
      .getByTestId('drag-handle');
    await handle.hover();
    // Drop on the top half of the first row, which means "before it".
    await handle.dragTo(list.getByTestId('task-row').first(), { targetPosition: { x: 60, y: 3 } });
    await expect.poll(names).toEqual(['Three', 'One', 'Two']);
  } finally {
    await app.close();
  }
});

// --- Phase 2: accomplishments and rituals ---------------------------------------------------

const todayDate = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test('finishing a task celebrates, earns XP and a win; undo takes them back', async () => {
  const { app, page, errors } = await launch(newDataDir());
  try {
    const list = page.getByTestId('daily-list');
    const add = list.getByPlaceholder('Add to today and press Enter');
    await add.fill('Grade the quizzes');
    await add.press('Enter');
    await list.getByRole('checkbox', { name: 'Complete Grade the quizzes' }).click();

    // 10 for the task, and 10 for emptying the inbox (it was added without an area).
    await expect(page.getByTestId('celebration-xp')).toHaveText('+20 XP');
    await expect(page.getByTestId('tile-xp')).toContainText('20');
    await expect(page.getByTestId('progress-card')).toContainText('Warming up');

    await page.getByRole('navigation').getByRole('button', { name: 'Wins' }).click();
    await expect(page.getByText('Grade the quizzes', { exact: true })).toBeVisible();
    await expect(page.getByTestId('xp-today')).toContainText('20 XP today · 1 win');
    await expect(page.getByTestId('achievement-first-capture')).toHaveAttribute(
      'data-unlocked',
      'true',
    );

    // Ctrl+Z undoes the completion: the XP and the win go away with it.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('xp-today')).toContainText('0 XP today · 0 wins');
    const ledger = await page.evaluate(() => window.cortex.accomplishments.summary());
    expect(ledger.totalXp).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('XP in the database is the sum of the events, and an undo is a negative event', async () => {
  const dataDir = newDataDir();
  const { app, page } = await launch(dataDir);
  try {
    await page.evaluate(async () => {
      const t = await window.cortex.tasks.create({ title: 'Big one', size: 'l' });
      await window.cortex.tasks.complete(t.id);
      const log = await window.cortex.undo.list();
      await window.cortex.undo.apply(log[0]!.id);
      await window.cortex.tasks.complete(t.id);
    });
  } finally {
    await app.close();
  }
  const db = new DatabaseSync(join(dataDir, 'cortex.db'));
  const points = db
    .prepare("SELECT points FROM xp_events WHERE kind = 'task' ORDER BY rowid")
    .all() as {
    points: number;
  }[];
  expect(points.map((p) => p.points)).toEqual([40, -40, 40]);
  db.close();
});

test('focus session: pick a length, see only the timer, Esc ends it', async () => {
  const { app, page } = await launch(newDataDir());
  try {
    await page.evaluate(() =>
      window.cortex.tasks.create({
        title: 'Plan the unit',
        dueDate: new Date().toISOString().slice(0, 10),
      }),
    );
    await page.getByRole('button', { name: 'Start a focus session' }).click();
    await page.getByRole('button', { name: '15 min' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const screen = page.getByTestId('focus-screen');
    await expect(screen).toBeVisible();
    await expect(page.getByTestId('focus-timer')).toHaveText(/^1[45]:\d\d$/);
    expect(await page.evaluate(() => window.cortex.focus.active())).not.toBeNull();

    await page.keyboard.press('Escape');
    await expect(screen).toHaveCount(0);
    expect(await page.evaluate(() => window.cortex.focus.active())).toBeNull();

    // Starting again and pressing Done also closes it.
    await page.getByRole('button', { name: 'Start a focus session' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await screen.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(screen).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('morning briefing: shown once a day, pick your first thing', async () => {
  test.skip(new Date().getHours() < 5, 'The briefing is offered from 5:00');
  const dataDir = newDataDir();
  const first = await launch(dataDir, {}, { keepBriefing: true });
  try {
    await first.page.evaluate(async (due) => {
      for (const title of ['First', 'Second', 'Third']) {
        await window.cortex.tasks.create({ title, dueDate: due });
      }
    }, todayDate());
    const briefing = first.page.getByTestId('briefing');
    await expect(briefing).toBeVisible();
    await briefing.getByRole('button', { name: 'Third' }).click();
    await expect(briefing).toHaveCount(0);
    // It is now the one in progress, and first in today's list.
    const names = await first.page.evaluate(async () => {
      const today = await window.cortex.today.get();
      return today.dueToday.map((t) => `${t.title}:${t.status}`);
    });
    expect(names[0]).toBe('Third:doing');
  } finally {
    await first.app.close();
  }
  // Not shown again the same day.
  const second = await launch(dataDir, {}, { keepBriefing: true });
  try {
    await expect(second.page.getByTestId('sidebar-version')).toBeVisible();
    await expect(second.page.getByTestId('briefing')).toHaveCount(0);
  } finally {
    await second.app.close();
  }
});

test('shutdown ritual: every open task gets a home, then the day closes', async () => {
  const dataDir = newDataDir();
  const { app, page, errors } = await launch(dataDir);
  try {
    await page.evaluate(async (due) => {
      for (const title of ['Alpha', 'Beta', 'Gamma']) {
        await window.cortex.tasks.create({ title, dueDate: due });
      }
    }, todayDate());
    await page.getByRole('button', { name: 'Shutdown', exact: true }).click();
    const ritual = page.getByTestId('shutdown');
    await ritual.getByRole('button', { name: 'Next' }).click(); // wins
    // Step 2: Next waits until each task has a place.
    const next = ritual.getByRole('button', { name: 'Next' });
    await expect(next).toBeDisabled();
    const card = (title: string) => ritual.getByTestId('unfinished').filter({ hasText: title });
    await card('Alpha').getByRole('button', { name: 'Tomorrow' }).click();
    await card('Beta').getByRole('button', { name: 'Someday' }).click();
    await expect(next).toBeDisabled();
    await card('Gamma').getByRole('button', { name: 'Done after all' }).click();
    await expect(next).toBeEnabled();
    await next.click(); // inbox
    await next.click(); // tomorrow
    await expect(ritual.getByText('Alpha')).toBeVisible();
    await ritual.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByTestId('shutdown-closed')).toContainText(
      'Everything is captured. You can stop thinking about work.',
    );
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
  // Nothing open is dated today, and the ritual paid out once.
  const db = new DatabaseSync(join(dataDir, 'cortex.db'));
  const open = db
    .prepare(
      "SELECT COUNT(*) AS n FROM tasks WHERE due_date = ? AND status IN ('inbox','todo','doing') AND deleted_at IS NULL",
    )
    .get(todayDate()) as { n: number };
  expect(open.n).toBe(0);
  const shutdown = db
    .prepare("SELECT SUM(points) AS s FROM xp_events WHERE kind = 'shutdown'")
    .get() as { s: number };
  expect(shutdown.s).toBe(10);
  db.close();
});
