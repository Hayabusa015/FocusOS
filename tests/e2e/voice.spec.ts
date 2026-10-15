/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { ALL_FIXED_LINES } from '../../src/shared/voice';
import { startFakeVoiceStudio } from './fake-voicestudio';

const root = resolve(__dirname, '../..');
const KEY = 'sk-ant-e2e-test-key-0123456789';
const dataDirs: string[] = [];

async function launch(
  voiceUrl: string,
): Promise<{ app: ElectronApplication; page: Page; errors: string[]; dataDir: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-e2e-voice-'));
  dataDirs.push(dataDir);
  const app = await electron.launch({
    cwd: root,
    // A fake microphone, accepted without a prompt: Cortex's own permission rule still decides.
    args: [
      '.',
      '--no-sandbox',
      '--disable-gpu',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
    env: {
      ...process.env,
      CORTEX_DATA_DIR: dataDir,
      CORTEX_TEST_ATLAS: 'fake',
      CORTEX_TEST_VOICESTUDIO_URL: voiceUrl,
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

/** Speech on, with quiet hours switched off so the test works at any time of day. */
const enableVoice = (page: Page) =>
  page.evaluate(() =>
    window.cortex.settings.update({ voiceEnabled: true, quietStart: '00:00', quietEnd: '00:00' }),
  );

test.afterAll(() => dataDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('Settings → Voice: status, preview a candidate, pick it, and the fixed lines are rendered once', async () => {
  const fake = await startFakeVoiceStudio();
  const { app, page, errors, dataDir } = await launch(fake.url);
  try {
    await nav(page, /^Settings/).click();
    await expect(page.getByTestId('voice-status')).toContainText('VoiceStudio is running');
    await expect(page.getByTestId('voice-fixed')).toContainText(`0 of ${ALL_FIXED_LINES.length}`);

    // Prepare the everyday lines: each is rendered once and kept as a file.
    await page.getByRole('button', { name: 'Prepare lines' }).click();
    await expect(page.getByTestId('voice-fixed')).toContainText(
      `${ALL_FIXED_LINES.length} of ${ALL_FIXED_LINES.length}`,
    );
    expect(readdirSync(join(dataDir, 'audio-cache'))).toHaveLength(ALL_FIXED_LINES.length);
    const rendered = fake.speech.length;
    expect(rendered).toBe(ALL_FIXED_LINES.length);
    // They were asked for in the designed voice, with its seed.
    expect(fake.speech[0]).toMatchObject({
      model: 'omnivoice',
      instruct: 'male, middle-aged, low pitch, british accent',
      seed: 7,
      response_format: 'wav',
    });
    await page.getByRole('button', { name: 'Prepare lines' }).click();
    await page.waitForTimeout(400);
    expect(fake.speech.length).toBe(rendered); // nothing rendered twice

    // A fixed line plays from the cache: no new request, and flagged as cached.
    const clip = await page.evaluate(() => window.cortex.voice.speak('Good morning.'));
    expect(clip).toMatchObject({ ok: true, cached: true });
    expect(fake.speech.length).toBe(rendered);

    // Preview a candidate: it is generated in that voice. Picking it re-keys the cache.
    const candidates = page.getByTestId('voice-candidates').locator('li');
    await candidates.nth(1).getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => fake.speech.length).toBeGreaterThan(rendered);
    expect(fake.speech.at(-1)).toMatchObject({
      instruct: 'male, middle-aged, very low pitch, british accent',
    });
    await candidates.nth(1).getByRole('button', { name: 'Use this voice' }).click();
    await expect(candidates.nth(1)).toContainText('In use');
    await expect(page.getByTestId('voice-fixed')).toContainText(`0 of ${ALL_FIXED_LINES.length}`);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fake.stop();
  }
});

test('quitting VoiceStudio switches Atlas to the fallback voice with no error', async () => {
  const fake = await startFakeVoiceStudio();
  const { app, page, errors } = await launch(fake.url);
  try {
    await enableVoice(page);
    await page.evaluate(async (key) => {
      const r = await window.cortex.atlas.setKey(key);
      if (!r.ok) throw new Error(r.error);
    }, KEY);
    await nav(page, /^Atlas/).click();
    const panel = page.getByRole('complementary', { name: 'Atlas' });

    // With VoiceStudio up, Atlas speaks in its own voice and there is no badge.
    await panel.getByLabel('Message Atlas').fill('hello');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.locator('[data-role="assistant"]').last()).toHaveText('Noted.');
    await expect.poll(() => fake.speech.length).toBeGreaterThan(0);
    await expect(page.getByTestId('fallback-badge')).toHaveCount(0);

    // Quit VoiceStudio. The next reply (a line not heard before, so not in the cache) is spoken
    // with the computer's voice, quietly.
    await fake.stop();
    await panel.getByLabel('Message Atlas').fill('Add grade lab reports to Chemistry for Friday');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('fallback-badge')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);

    // The microphone explains itself rather than failing.
    await expect(panel.getByTestId('mic')).toBeDisabled({ timeout: 15_000 });
  } finally {
    await app.close();
    await fake.stop().catch(() => undefined);
  }
});

test('push-to-talk: the button records, VoiceStudio transcribes, the words land in the box', async () => {
  const fake = await startFakeVoiceStudio({ transcript: 'add a task called test the voice' });
  const { app, page, errors } = await launch(fake.url);
  try {
    await enableVoice(page);
    await page.evaluate(async (key) => {
      const r = await window.cortex.atlas.setKey(key);
      if (!r.ok) throw new Error(r.error);
    }, KEY);
    await nav(page, /^Atlas/).click();
    const panel = page.getByRole('complementary', { name: 'Atlas' });
    const mic = panel.getByTestId('mic');
    await expect(mic).toBeEnabled();

    // Hold the button, talk (to the fake microphone), let go.
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1500);
    await page.mouse.up();
    await expect(panel.getByLabel('Message Atlas')).toHaveValue(
      'add a task called test the voice',
      {
        timeout: 15_000,
      },
    );
    expect(fake.transcriptions).toHaveLength(1);
    expect(fake.transcriptions[0]!.fileName).toBe('speech.webm');
    expect(fake.transcriptions[0]!.bytes).toBeGreaterThan(800);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fake.stop();
  }
});

test('push-to-talk: the hotkey is held while speech is on, and toggles recording from anywhere', async () => {
  const fake = await startFakeVoiceStudio({ transcript: 'what is on today' });
  const { app, page, errors } = await launch(fake.url);
  try {
    // Off by default: the key is not taken.
    expect(
      await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+Space')),
    ).toBe(false);
    await enableVoice(page);
    expect(
      await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+Space')),
    ).toBe(true);
    await page.evaluate(async (key) => {
      const r = await window.cortex.atlas.setKey(key);
      if (!r.ok) throw new Error(r.error);
    }, KEY);

    // The hotkey (as the main process sends it) opens the panel and starts recording; again stops.
    const press = () =>
      app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('voice:toggle');
      });
    await press();
    const panel = page.getByRole('complementary', { name: 'Atlas' });
    await expect(panel.getByTestId('mic')).toHaveAttribute('aria-pressed', 'true', {
      timeout: 10_000,
    });
    await page.waitForTimeout(1500);
    await press();
    await expect(panel.getByLabel('Message Atlas')).toHaveValue('what is on today', {
      timeout: 15_000,
    });

    // Turning speech off gives the key back.
    await page.evaluate(() => window.cortex.settings.update({ voiceEnabled: false }));
    expect(
      await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+Space')),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fake.stop();
  }
});

test('with speech off (the default) Cortex asks VoiceStudio for nothing and shows no mic', async () => {
  const fake = await startFakeVoiceStudio();
  const { app, page, errors, dataDir } = await launch(fake.url);
  try {
    await page.waitForTimeout(6500); // longer than the start-up pre-render delay
    expect(fake.speech).toHaveLength(0);
    expect(existsSync(join(dataDir, 'audio-cache'))).toBe(false);
    await nav(page, /^Atlas/).click();
    await expect(page.getByTestId('mic')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fake.stop();
  }
});
