import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A small rotating file log: `cortex.log`, rotated at 1 MB, three old files kept (PLAN §12).
 * It records errors and app events only. Never pass it email text, note text or secrets.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const MAX_LOG_BYTES = 1024 * 1024;
export const KEPT_LOGS = 3;

export function createLogger(dir: string, now: () => Date = () => new Date()): Logger {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'cortex.log');

  const rotate = () => {
    if (!existsSync(file) || statSync(file).size < MAX_LOG_BYTES) return;
    rmSync(join(dir, `cortex.${KEPT_LOGS}.log`), { force: true });
    for (let i = KEPT_LOGS - 1; i >= 1; i--) {
      const from = join(dir, `cortex.${i}.log`);
      if (existsSync(from)) renameSync(from, join(dir, `cortex.${i + 1}.log`));
    }
    renameSync(file, join(dir, 'cortex.1.log'));
  };

  const write = (level: string, message: string) => {
    try {
      rotate();
      appendFileSync(file, `${now().toISOString()} ${level} ${message}\n`);
    } catch {
      // Logging must never break the app.
    }
  };
  return {
    info: (m) => write('INFO ', m),
    warn: (m) => write('WARN ', m),
    error: (m) => write('ERROR', m),
  };
}
