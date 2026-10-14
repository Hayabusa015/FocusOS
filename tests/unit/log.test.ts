import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, KEPT_LOGS, MAX_LOG_BYTES } from '../../src/main/log';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'cortex-log-'));
  dirs.push(d);
  return d;
};

describe('createLogger', () => {
  it('appends timestamped lines', () => {
    const dir = tmp();
    const log = createLogger(dir, () => new Date('2026-10-14T12:00:00Z'));
    log.info('started');
    log.error('broke');
    expect(readFileSync(join(dir, 'cortex.log'), 'utf8')).toBe(
      '2026-10-14T12:00:00.000Z INFO  started\n2026-10-14T12:00:00.000Z ERROR broke\n',
    );
  });

  it('rotates at 1 MB and keeps only three old files', () => {
    const dir = tmp();
    const log = createLogger(dir);
    for (let round = 1; round <= KEPT_LOGS + 2; round++) {
      writeFileSync(join(dir, 'cortex.log'), `round ${round}\n`.padEnd(MAX_LOG_BYTES, 'x'));
      log.info(`after round ${round}`);
    }
    expect(existsSync(join(dir, 'cortex.log'))).toBe(true);
    expect(existsSync(join(dir, `cortex.${KEPT_LOGS}.log`))).toBe(true);
    expect(existsSync(join(dir, `cortex.${KEPT_LOGS + 1}.log`))).toBe(false);
    expect(
      readFileSync(join(dir, 'cortex.1.log'), 'utf8').startsWith(`round ${KEPT_LOGS + 2}`),
    ).toBe(true);
  });

  it('never throws, even when the folder is unusable', () => {
    const dir = tmp();
    const log = createLogger(dir);
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, 'a file where the folder was');
    expect(() => log.info('still fine')).not.toThrow();
  });
});
