/// <reference lib="dom" />
import type {} from '../../src/renderer/global';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('Pulse lists: progress, inline subtasks, drag ordering, undo and restart persistence', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cortex-pulse-'));
  const launch = async () => {
    const app = await electron.launch({
      cwd: resolve(__dirname, '../..'),
      args: ['.', '--no-sandbox', '--disable-gpu'],
      env: { ...process.env, CORTEX_DATA_DIR: dataDir },
    });
    await app.firstWindow();
    await expect
      .poll(() => app.windows().find((w) => !w.url().includes('#/capture') && w.url() !== ''))
      .toBeTruthy();
    const page = app.windows().find((w) => !w.url().includes('#/capture') && w.url() !== '')!;
    const due = await page.evaluate(() => window.cortex.rituals.state().then((r) => r.briefingDue));
    if (due) await page.getByTestId('briefing').getByRole('button', { name: 'Not now' }).click();
    return { app, page };
  };
  let running = await launch();
  try {
    const { page } = running;
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    const ids = await page.evaluate(async () => {
      const date = (await window.cortex.today.get()).date;
      const chemistry = (await window.cortex.areas.list()).find((a) => a.name === 'Chemistry')!;
      const first = await window.cortex.tasks.create({
        title: 'Lab preparation',
        dueDate: date,
        areaId: chemistry.id,
      });
      const second = await window.cortex.tasks.create({
        title: 'Lesson planning',
        dueDate: date,
        areaId: chemistry.id,
      });
      const a = await window.cortex.tasks.create({ title: 'Print lab sheets', parentId: first.id });
      const b = await window.cortex.tasks.create({
        title: 'Set out equipment',
        parentId: first.id,
      });
      return { first: first.id, second: second.id, a: a.id, b: b.id };
    });
    const first = page.locator(`[data-list-id="${ids.first}"]`);
    await expect(first).toBeVisible();
    await first.getByRole('checkbox', { name: 'Complete Print lab sheets', exact: true }).click();
    await expect(first.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await expect(
      page.getByRole('progressbar', { name: 'Overall completion', exact: true }),
    ).toHaveAttribute('aria-valuenow', '33');
    await first.getByLabel('Add a subtask to Lab preparation').fill('Check safety notes');
    await first.getByLabel('Add a subtask to Lab preparation').press('Enter');
    await expect(
      first.getByRole('checkbox', { name: 'Complete Check safety notes' }),
    ).toBeVisible();
    await first
      .getByRole('button', { name: 'Reorder Set out equipment', exact: true })
      .dragTo(first.locator(`[data-step-id="${ids.a}"]`), { targetPosition: { x: 100, y: 2 } });
    await expect(first.locator('[data-step-id]').first()).toHaveAttribute('data-step-id', ids.b);
    await page
      .getByRole('button', { name: 'Reorder Lesson planning', exact: true })
      .dragTo(first.locator('.pulse-list-heading'), { targetPosition: { x: 80, y: 3 } });
    await expect(page.locator('[data-list-id]').first()).toHaveAttribute(
      'data-list-id',
      ids.second,
    );
    await running.app.close();
    running = await launch();
    await expect(running.page.locator('[data-list-id]').first()).toHaveAttribute(
      'data-list-id',
      ids.second,
    );
    const restored = running.page.locator(`[data-list-id="${ids.first}"]`);
    await expect(restored.locator('[data-step-id]').first()).toHaveAttribute('data-step-id', ids.b);
    await expect(restored.getByRole('checkbox', { name: 'Reopen Print lab sheets' })).toBeChecked();
    await restored.getByRole('checkbox', { name: 'Complete Set out equipment' }).click();
    await expect(restored.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
    await running.page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(restored.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    const destination = running.page.locator(`[data-list-id="${ids.second}"]`);
    await restored
      .getByRole('button', { name: 'Reorder Set out equipment', exact: true })
      .dragTo(destination.locator('.pulse-list-heading'));
    await expect(destination.locator(`[data-step-id="${ids.b}"]`)).toBeVisible();
    await running.page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(restored.locator(`[data-step-id="${ids.b}"]`)).toBeVisible();
    await running.page.getByRole('button', { name: 'Capture', exact: false }).click();
    await running.page.getByLabel('Capture a task').fill('Buy pencils #chem !today');
    await running.page.getByLabel('Capture a task').press('Enter');
    await expect(running.page.getByRole('dialog', { name: 'Get it off your mind.' })).toHaveCount(
      0,
    );
    await expect(
      running.page.locator('.pulse-list-title strong').filter({ hasText: 'Buy pencils' }),
    ).toBeVisible();
    await running.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Chemistry', exact: true })
      .click();
    await expect(
      running.page.getByRole('heading', { name: 'Chemistry', exact: true }),
    ).toBeVisible();
    await expect(running.page.locator(`[data-list-id="${ids.first}"]`)).toBeVisible();
    await running.page.getByRole('button', { name: 'Board view', exact: true }).click();
    await expect(running.page.getByText('Doing', { exact: true })).toBeVisible();
    await running.page.getByRole('button', { name: 'List view', exact: true }).click();
    await running.page.emulateMedia({ reducedMotion: 'reduce' });
    await running.page.setViewportSize({ width: 900, height: 760 });
    expect(
      await running.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  } finally {
    await running.app.close();
    expect(resolve(dataDir).startsWith(resolve(tmpdir()))).toBe(true);
    rmSync(dataDir, { recursive: true, force: true });
  }
});
