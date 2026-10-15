import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/shared/csp';

describe('buildCsp', () => {
  it('is strict in production: no inline script, no network, no eval', () => {
    const csp = buildCsp(false);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it('lets spoken clips play from blobs, and still makes no network calls', () => {
    for (const dev of [true, false]) expect(buildCsp(dev)).toContain("media-src 'self' blob:");
    expect(buildCsp(false)).toContain("connect-src 'none'");
  });
  it('allows only the local dev server in development', () => {
    const csp = buildCsp(true);
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toMatch(/https?:\/\/(?!localhost)/);
  });
});
