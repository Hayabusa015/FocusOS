/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const root = resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath = require('electron') as unknown as string;
void electronPath;
const KEY = 'sk-ant-e2e-test-key-0123456789';
const dataDirs: string[] = [];

/** Starts the app with Atlas talking to the built-in pretend API (never the network). */
async function launch(): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-atlas-'));
  dataDirs.push(dataDir);
  const app = await electron.launch({
    cwd: root,
    args: ['.', '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, CORTEX_DATA_DIR: dataDir, CORTEX_TEST_ATLAS: 'fake' },
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
  return { app, page, errors };
}

const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });
const openAtlas = (page: Page) => nav(page, /^Atlas/).click();

const setKey = (page: Page) =>
  page.evaluate(async (key) => {
    const r = await window.cortex.atlas.setKey(key);
    if (!r.ok) throw new Error(r.error);
  }, KEY);

test.afterAll(() => dataDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('with no key, Atlas explains itself and the rest of the app works', async () => {
  const { app, page, errors } = await launch();
  try {
    await openAtlas(page);
    const panel = page.getByRole('complementary', { name: 'Atlas' });
    await expect(panel).toContainText('Atlas needs your Anthropic API key');
    await expect(panel.getByLabel('Message Atlas')).toBeDisabled();

    // Everything else is unaffected.
    await page.evaluate(() => window.cortex.capture.submit('Order beakers'));
    const inbox = await page.evaluate(() => window.cortex.tasks.list({ view: 'inbox' }));
    expect(inbox.map((t) => t.title)).toEqual(['Order beakers']);

    // Settings: a wrong paste is refused in words; the right key is saved and never shown again.
    await panel.getByRole('button', { name: 'Open Settings' }).click();
    await expect(page.getByTestId('atlas-key-state')).toHaveText('not set');
    await page.getByLabel('Anthropic API key').fill('hunter2');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByRole('alert')).toContainText('does not look like an Anthropic API key');
    await page.getByLabel('Anthropic API key').fill(KEY);
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByTestId('atlas-key-state')).toHaveText('saved');
    await expect(page.getByLabel('Anthropic API key')).toHaveValue('');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('chat adds a task, shows it under "changed today", and Undo takes it back', async () => {
  const { app, page, errors } = await launch();
  try {
    await setKey(page);
    await openAtlas(page);
    const panel = page.getByRole('complementary', { name: 'Atlas' });
    await panel.getByLabel('Message Atlas').fill('Add grade lab reports to Chemistry for Friday');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.locator('[data-role="assistant"]').last()).toHaveText('Done.');

    const tasks = await page.evaluate(async () => {
      const areas = await window.cortex.areas.list();
      const chem = areas.find((a) => a.name === 'Chemistry')!;
      return window.cortex.tasks.list({ view: 'area', areaId: chem.id });
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: 'Grade lab reports', source: 'atlas' });
    expect(new Date(`${tasks[0]!.dueDate}T12:00:00`).getDay()).toBe(5);

    const changes = panel.getByTestId('atlas-changes');
    await expect(changes).toContainText('Grade lab reports');
    await changes.getByRole('button', { name: /^Undo/ }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const areas = await window.cortex.areas.list();
          const chem = areas.find((a) => a.name === 'Chemistry')!;
          return (await window.cortex.tasks.list({ view: 'area', areaId: chem.id })).length;
        }),
      )
      .toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('Sort with Atlas changes nothing until Apply, and Undo all puts it back', async () => {
  const { app, page, errors } = await launch();
  try {
    await setKey(page);
    await page.evaluate(async () => {
      for (const title of ['Order beakers for lab', 'Fix the gutter', 'Something odd'])
        await window.cortex.tasks.create({ title });
    });
    await nav(page, /^Inbox/).click();
    await page.getByRole('button', { name: 'Sort with Atlas' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sort with Atlas' });
    await expect(dialog.getByTestId('sort-proposals').locator('li')).toHaveCount(3);

    const inboxCount = () =>
      page.evaluate(() => window.cortex.tasks.list({ view: 'inbox' }).then((t) => t.length));
    expect(await inboxCount()).toBe(3); // a proposal changes nothing

    await dialog.getByRole('button', { name: /^Apply/ }).click();
    await expect(dialog.getByTestId('atlas-applied')).toContainText('Atlas sorted 2 items');
    expect(await inboxCount()).toBe(1);

    await dialog.getByRole('button', { name: 'Undo all' }).click();
    await expect.poll(inboxCount).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('a five-item brain dump becomes an editable checklist that saves only on Add', async () => {
  const { app, page, errors } = await launch();
  try {
    await setKey(page);
    await nav(page, /^Inbox/).click();
    await page.getByRole('button', { name: 'Brain dump' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Brain dump' });
    await dialog
      .getByLabel(/Type or paste/)
      .fill(
        'email the principal, grade lab reports, buy zinc for chem, call mom, order a projector bulb, maybe a new partner system?',
      );
    await dialog.getByRole('button', { name: 'Sort it out' }).click();
    const rows = dialog.getByTestId('dump-tasks').locator('li');
    await expect(rows).toHaveCount(5);
    await expect(dialog.getByRole('checkbox', { checked: true })).toHaveCount(5);
    await expect(dialog).toContainText('maybe a new partner system?');

    const count = () =>
      page.evaluate(() => window.cortex.tasks.list({ view: 'inbox' }).then((t) => t.length));
    expect(await count()).toBe(0); // nothing saved yet

    await rows.nth(3).getByRole('checkbox').uncheck(); // untick "call mom"
    await rows.nth(0).getByLabel('Task title').fill('Email the principal about Friday');
    await dialog.getByRole('button', { name: 'Add 4' }).click();
    await expect(dialog.getByTestId('atlas-applied')).toContainText('Added 4 tasks');
    const titles = await page.evaluate(() =>
      window.cortex.tasks.list({ view: 'inbox' }).then((t) => t.map((x) => x.title)),
    );
    expect(titles).toHaveLength(2); // the lab and zinc ones were filed under Chemistry
    expect(titles).toContain('Email the principal about Friday');
    expect(titles).not.toContain('Call mom');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('Plan the rest of today proposes blocks inside the day and schedules only on accept', async () => {
  const { app, page, errors } = await launch();
  try {
    await setKey(page);
    await page.evaluate(async () => {
      await window.cortex.settings.update({ dayStart: '00:00', dayEnd: '23:55' });
      const today = new Date();
      const due = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      for (const title of ['Grade quizzes', 'Plan the lab'])
        await window.cortex.tasks.create({ title, dueDate: due, size: 'm' });
    });
    await nav(page, /^Today$/).click();
    await page.getByRole('button', { name: 'Plan the rest of today' }).click();
    const dialog = page.getByRole('dialog', { name: 'Plan the rest of today' });
    await expect(dialog.getByTestId('plan-summary')).toBeVisible();
    const summary = (await dialog.getByTestId('plan-summary').textContent()) ?? '';
    const [free, planned] = [
      ...summary.matchAll(/(\d+) (?:free minutes|and keeps)|plans (\d+)/g),
    ].flatMap((m) => ((m[1] ?? m[2]) ? [Number(m[1] ?? m[2])] : []));
    expect(planned!).toBeLessThanOrEqual(Math.floor(free! * 0.8));

    const blockCount = () =>
      page.evaluate(() => window.cortex.today.get().then((t) => t.blocks.length));
    expect(await blockCount()).toBe(0); // proposing changes nothing
    const schedule = dialog.getByRole('button', { name: /^Schedule/ });
    if (await schedule.isEnabled()) {
      await schedule.click();
      await expect(dialog.getByTestId('atlas-applied')).toContainText('Atlas scheduled');
      expect(await blockCount()).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
