import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  decideRelease,
  extractChangelogSection,
  parseSemver,
} from '../../scripts/release-check.mjs';

const changelog = `# Changelog

## [0.0.2] - 2026-10-20
- A harmless change

## [0.0.1] - 2026-10-14
First release.
- Item one
`;

describe('semver', () => {
  it('parses X.Y.Z only and compares numerically', () => {
    expect(parseSemver('0.0.1')).toEqual([0, 0, 1]);
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('1.2.3-beta')).toBeNull();
    expect(compareSemver('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareSemver('0.0.1', '0.0.1')).toBe(0);
  });
});

describe('extractChangelogSection', () => {
  it('returns the body of the matching section only', () => {
    expect(extractChangelogSection(changelog, '0.0.1')).toBe('First release.\n- Item one');
    expect(extractChangelogSection(changelog, '0.0.2')).toBe('- A harmless change');
    expect(extractChangelogSection(changelog, '0.0.3')).toBeNull();
  });
  it('does not confuse 0.0.1 with 0.0.10', () => {
    expect(extractChangelogSection('## [0.0.10] - x\nten\n', '0.0.1')).toBeNull();
  });
  it('treats an empty section as missing', () => {
    expect(extractChangelogSection('## [0.0.4] - x\n\n## [0.0.3] - y\nstuff', '0.0.4')).toBeNull();
  });
});

describe('decideRelease', () => {
  it('publishes the very first release', () => {
    const d = decideRelease({ version: '0.0.1', latestTag: '', changelog });
    expect(d).toMatchObject({ shouldRelease: true, tag: 'v0.0.1' });
    expect(d.notes).toContain('First release.');
  });

  it('publishes a newer version with its notes', () => {
    const d = decideRelease({ version: '0.0.2', latestTag: 'v0.0.1', changelog });
    expect(d).toMatchObject({ shouldRelease: true, tag: 'v0.0.2', notes: '- A harmless change' });
  });

  it('publishes nothing when the version was not bumped', () => {
    const d = decideRelease({ version: '0.0.1', latestTag: 'v0.0.1', changelog });
    expect(d.shouldRelease).toBe(false);
    expect(d.reason).toMatch(/not newer/);
  });

  it('publishes nothing when the version is lower than the latest release', () => {
    expect(decideRelease({ version: '0.0.1', latestTag: 'v0.1.0', changelog }).shouldRelease).toBe(
      false,
    );
  });

  it('fails a newer version that has no changelog section', () => {
    expect(() => decideRelease({ version: '0.0.3', latestTag: 'v0.0.2', changelog })).toThrow(
      /no section for 0\.0\.3/,
    );
  });

  it('fails on a malformed version or tag', () => {
    expect(() => decideRelease({ version: 'abc', latestTag: '', changelog })).toThrow(/X\.Y\.Z/);
    expect(() => decideRelease({ version: '0.0.2', latestTag: 'nightly', changelog })).toThrow(
      /vX\.Y\.Z/,
    );
  });
});
