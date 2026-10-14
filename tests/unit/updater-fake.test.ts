import { describe, expect, it } from 'vitest';
import { fakeReleaseNotes, nextPatchVersion } from '../../src/main/updater-fake';

describe('nextPatchVersion', () => {
  it('is always one patch ahead', () => {
    expect(nextPatchVersion('0.0.1')).toBe('0.0.2');
    expect(nextPatchVersion('0.3.9')).toBe('0.3.10');
    expect(nextPatchVersion('1.2.3')).toBe('1.2.4');
  });
  it('refuses anything that is not X.Y.Z', () => {
    expect(() => nextPatchVersion('1.2')).toThrow();
    expect(() => nextPatchVersion('1.2.3-beta')).toThrow();
  });
});

describe('fakeReleaseNotes', () => {
  it('names the version it announces', () => {
    expect(fakeReleaseNotes('0.0.2')).toContain('## 0.0.2');
  });
});
