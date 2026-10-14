/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const root = resolve(__dirname, '../..');
// The `electron` package exports the path to the Electron binary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath = require('electron') as unknown as string;
const dataDirs: string[] = [];

async function launch(
  dataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    cwd: root,
    args: ['.', '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, CORTEX_DATA_DIR: dataDir, ...extraEnv },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errors };
}

test.afterAll(() => dataDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('opens on an empty Today page and shows the installed version in Settings', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-'));
  dataDirs.push(dataDir);
  const { app, page, errors } = await launch(dataDir);
  try {
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Still up/ }),
    ).toBeVisible();
    await expect(page.getByText('Nothing here yet')).toBeVisible();
    await page.screenshot({ path: 'test-results/today.png' });

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('installed-version')).toHaveText('0.0.1');
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
      cortexKeys: ['app', 'updater'],
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
    expect(info).toMatchObject({ name: 'Cortex', version: '0.0.1', dataDir, isPackaged: false });

    const settings = await page.evaluate(() => window.cortex.updater.getState());
    expect(settings).toMatchObject({ status: 'disabled', currentVersion: '0.0.1' });

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
  expect(JSON.parse(row.value)).toBe('0.0.1');
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

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Check for updates' }).click();

    const banner = page.getByRole('status', { name: 'Update' });
    await expect(banner.getByText('Cortex 0.0.2 is available.')).toBeVisible();
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
    await expect(page.getByText('0.0.2', { exact: true })).toBeVisible();
    // A manual check brings it back.
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await expect(banner.getByText('Cortex 0.0.2 is available.')).toBeVisible();

    // Update now: progress, then ready to restart, and the data is backed up before install.
    await banner.getByRole('button', { name: 'Update now' }).click();
    await expect(banner.getByText('Cortex 0.0.2 is ready to install.')).toBeVisible();
    await page.screenshot({ path: 'test-results/update-ready.png' });
    const backup = join(dataDir, 'backups', 'pre-update-0.0.1-to-0.0.2.db');
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
