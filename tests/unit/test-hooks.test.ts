import { describe, expect, it } from 'vitest';
import {
  googleFake,
  testHooksEnabled,
  updaterMode,
  voiceStudioUrl,
} from '../../src/main/test-hooks';

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

describe('googleFake', () => {
  it('can never swap in a pretend Google in an installed app', () => {
    expect(googleFake(true, { CORTEX_TEST_GOOGLE: 'fake' })).toBe(false);
    expect(googleFake(true, {})).toBe(false);
  });

  it('is on only when an unpackaged build asks for it', () => {
    expect(googleFake(false, { CORTEX_TEST_GOOGLE: 'fake' })).toBe(true);
    expect(googleFake(false, { CORTEX_TEST_GOOGLE: 'real' })).toBe(false);
    expect(googleFake(false, {})).toBe(false);
  });
});

describe('voiceStudioUrl', () => {
  it('can never redirect an installed app away from the real VoiceStudio', () => {
    expect(
      voiceStudioUrl(true, { CORTEX_TEST_VOICESTUDIO_URL: 'http://evil.example' }),
    ).toBeUndefined();
    expect(voiceStudioUrl(false, { CORTEX_TEST_VOICESTUDIO_URL: 'http://127.0.0.1:1' })).toBe(
      'http://127.0.0.1:1',
    );
  });
});
