import { describe, expect, it } from 'vitest';
import { testHooksEnabled, updaterMode } from '../../src/main/test-hooks';

describe('updaterMode', () => {
  it('always uses the real feed in a packaged build, whatever the environment says', () => {
    expect(updaterMode(true, {})).toBe('real');
    expect(updaterMode(true, { CORTEX_TEST_UPDATER: 'fake' })).toBe('real');
    expect(updaterMode(true, { CORTEX_TEST_UPDATER: 'anything' })).toBe('real');
  });

  it('uses the fake feed only when an unpackaged build asks for it', () => {
    expect(updaterMode(false, { CORTEX_TEST_UPDATER: 'fake' })).toBe('fake');
    expect(updaterMode(false, { CORTEX_TEST_UPDATER: 'real' })).toBe('off');
    expect(updaterMode(false, {})).toBe('off');
  });
});

describe('testHooksEnabled', () => {
  it('is off in a packaged build, so CORTEX_DATA_DIR and CORTEX_TEST are ignored there', () => {
    expect(testHooksEnabled(true)).toBe(false);
    expect(testHooksEnabled(false)).toBe(true);
  });
});
