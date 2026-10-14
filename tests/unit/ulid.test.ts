import { describe, expect, it } from 'vitest';
import { ulid } from '../../src/main/domain/ulid';

const fixedRandom = (n: number) => new Uint8Array(n).fill(7);

describe('ulid', () => {
  it('is 26 characters of Crockford base32', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('sorts by creation time', () => {
    const earlier = ulid(1_700_000_000_000, fixedRandom);
    const later = ulid(1_700_000_000_001, fixedRandom);
    expect(earlier < later).toBe(true);
  });

  it('keeps ids made in the same millisecond in creation order', () => {
    const ids = Array.from({ length: 500 }, () => ulid(1_800_000_000_000, fixedRandom));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is unique across many real calls', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => ulid()));
    expect(ids.size).toBe(5000);
  });

  it('encodes the timestamp in the first ten characters', () => {
    expect(ulid(0, fixedRandom).slice(0, 10)).toBe('0000000000');
    expect(ulid(31, fixedRandom).slice(0, 10)).toBe('000000000Z');
    expect(ulid(32, fixedRandom).slice(0, 10)).toBe('0000000010');
  });
});
