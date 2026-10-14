import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CHANNELS } from '../../src/shared/channels';
import { SnoozeRequest } from '../../src/shared/schemas';
import { isAppUrl, makeTrustCheck } from '../../src/main/ipc/trust';

// `electron` is only imported for ipcMain, which these tests never reach.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: {} }));
const { makeHandler } = await import('../../src/main/ipc/handle');

const trusted = { senderFrame: { url: 'file:///C:/Cortex/resources/app/out/renderer/index.html' } };
const stranger = { senderFrame: { url: 'https://evil.example/index.html' } };
const asEvent = (e: unknown) => e as Parameters<ReturnType<typeof makeHandler>>[0];

describe('makeHandler', () => {
  const run = (event: unknown, payload: unknown, isTrusted = makeTrustCheck(undefined)) =>
    makeHandler(
      SnoozeRequest,
      ({ version }) => `snoozed ${version}`,
      isTrusted,
    )(asEvent(event), payload);

  it('passes a valid payload from the app window', async () => {
    await expect(run(trusted, { version: '0.0.2' })).resolves.toBe('snoozed 0.0.2');
  });

  it('rejects an invalid payload with a plain message', async () => {
    await expect(run(trusted, { version: '' })).rejects.toThrow(/Invalid request/);
    await expect(run(trusted, undefined)).rejects.toThrow(/Invalid request/);
    await expect(run(trusted, { version: 3 })).rejects.toThrow(/Invalid request/);
  });

  it('rejects any frame that is not the app itself', async () => {
    await expect(run(stranger, { version: '0.0.2' })).rejects.toThrow(/Blocked/);
    await expect(run({ senderFrame: null }, { version: '0.0.2' })).rejects.toThrow(/Blocked/);
  });

  it('does not call the handler when validation fails', async () => {
    const fn = vi.fn();
    await expect(
      makeHandler(z.object({ n: z.number() }), fn, () => true)(asEvent(trusted), { n: 'x' }),
    ).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('isAppUrl', () => {
  it('accepts the built renderer and the dev server, and nothing else', () => {
    expect(isAppUrl('file:///C:/x/out/renderer/index.html', undefined)).toBe(true);
    expect(isAppUrl('file:///C:/x/out/renderer/index.html#/settings', undefined)).toBe(true);
    expect(isAppUrl('file:///C:/Users/me/evil.html', undefined)).toBe(false);
    expect(isAppUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isAppUrl('http://localhost:5173/', undefined)).toBe(false);
    expect(isAppUrl('https://example.com/renderer/index.html', undefined)).toBe(false);
  });
});

describe('channels', () => {
  it('are unique', () => {
    const names = Object.values(CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });
});
