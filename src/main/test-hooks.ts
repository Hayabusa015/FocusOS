/**
 * The environment variables that exist only for tests (CORTEX_DATA_DIR, CORTEX_TEST,
 * CORTEX_TEST_UPDATER). They are read only in an unpackaged build, so nothing in the
 * environment can redirect, or swap the update feed of, the installed app.
 */
export type UpdaterMode = 'real' | 'fake' | 'off';

export function testHooksEnabled(isPackaged: boolean): boolean {
  return !isPackaged;
}

/** Which update feed to use. A packaged build always gets the real one. */
export function updaterMode(
  isPackaged: boolean,
  env: Record<string, string | undefined>,
): UpdaterMode {
  if (isPackaged) return 'real';
  return env['CORTEX_TEST_UPDATER'] === 'fake' ? 'fake' : 'off';
}

/**
 * Whether Atlas talks to a pretend API (CORTEX_TEST_ATLAS=fake), for the end-to-end tests. Like the
 * other hooks it is read only in an unpackaged build, so an installed app always uses the real one.
 */
export function atlasFake(isPackaged: boolean, env: Record<string, string | undefined>): boolean {
  return !isPackaged && env['CORTEX_TEST_ATLAS'] === 'fake';
}

/**
 * A stand-in VoiceStudio address (CORTEX_TEST_VOICESTUDIO_URL) for the end-to-end tests. Read only
 * in an unpackaged build, so an installed app always talks to the real one on port 3900.
 */
export function voiceStudioUrl(
  isPackaged: boolean,
  env: Record<string, string | undefined>,
): string | undefined {
  return isPackaged ? undefined : env['CORTEX_TEST_VOICESTUDIO_URL'];
}

/**
 * Whether Google is a pretend one (CORTEX_TEST_GOOGLE=fake), for the end-to-end tests. Like the
 * others it is read only in an unpackaged build, so an installed app can never be pointed at it.
 */
export function googleFake(isPackaged: boolean, env: Record<string, string | undefined>): boolean {
  return !isPackaged && env['CORTEX_TEST_GOOGLE'] === 'fake';
}
