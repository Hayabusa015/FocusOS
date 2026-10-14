import { randomBytes } from 'node:crypto';

/**
 * ULIDs (PLAN §6): 26 characters, sortable by creation time, unique without coordination.
 * Ten characters of millisecond timestamp, then sixteen of randomness. IDs made in the same
 * millisecond still sort in creation order, because the random part is incremented instead
 * of redrawn.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = -1;
let lastRandom: number[] = [];

function freshRandom(source: (n: number) => Uint8Array): number[] {
  const bytes = source(10);
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out.push((buffer >> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  return out.slice(0, 16);
}

function increment(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if ((next[i] as number) < 31) {
      next[i] = (next[i] as number) + 1;
      return next;
    }
    next[i] = 0;
  }
  throw new Error('ULID randomness overflowed within one millisecond');
}

export function ulid(
  now: number = Date.now(),
  source: (n: number) => Uint8Array = randomBytes,
): string {
  if (now === lastTime) {
    lastRandom = increment(lastRandom);
  } else {
    lastTime = now;
    lastRandom = freshRandom(source);
  }
  let time = '';
  let remaining = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  return time + lastRandom.map((d) => ALPHABET[d]).join('');
}
