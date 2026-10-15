import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Rendered clips kept as files under the app data folder (PLAN §8.3), so a line that has been
 * spoken once, or was rendered ahead of time, plays with no wait. The key is
 * sha256(voice + text), so changing the voice never plays a clip in the old one.
 */
export const cacheKey = (voiceId: string, text: string): string =>
  createHash('sha256').update(`${voiceId}\n${text}`).digest('hex');

const EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

export interface AudioCache {
  get(key: string): { bytes: Uint8Array; mime: string } | null;
  put(key: string, bytes: Uint8Array, mime: string): void;
  has(key: string): boolean;
  /** Removes the oldest files until the folder is under `maxBytes`. */
  prune(maxBytes: number): number;
}

export function createAudioCache(dir: string): AudioCache {
  const find = (key: string): string | null => {
    for (const ext of Object.keys(MIME)) {
      const path = join(dir, `${key}.${ext}`);
      if (existsSync(path)) return path;
    }
    return null;
  };
  return {
    has: (key) => find(key) !== null,
    get(key) {
      const path = find(key);
      if (!path) return null;
      try {
        const ext = path.slice(path.lastIndexOf('.') + 1);
        return { bytes: new Uint8Array(readFileSync(path)), mime: MIME[ext] ?? 'audio/wav' };
      } catch {
        return null;
      }
    },
    put(key, bytes, mime) {
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${key}.${EXT[mime] ?? 'wav'}`);
      // Written whole, then renamed, so a half-written clip is never played.
      const temp = `${path}.tmp`;
      writeFileSync(temp, bytes);
      renameSync(temp, path);
    },
    prune(maxBytes) {
      if (!existsSync(dir)) return 0;
      const files = readdirSync(dir)
        .filter((f) => !f.endsWith('.tmp'))
        .map((f) => ({ path: join(dir, f), ...statSync(join(dir, f)) }))
        .sort((a, b) => a.mtimeMs - b.mtimeMs);
      let total = files.reduce((n, f) => n + f.size, 0);
      let removed = 0;
      for (const f of files) {
        if (total <= maxBytes) break;
        unlinkSync(f.path);
        total -= f.size;
        removed++;
      }
      return removed;
    },
  };
}
