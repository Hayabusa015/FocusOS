import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Opt-in tests against the real Anthropic, Google and VoiceStudio services (PLAN §14).
// They are never part of `npm test` or CI.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer') } },
  test: {
    include: ['tests/live/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    env: { TZ: 'America/New_York' },
    testTimeout: 120_000,
  },
});
