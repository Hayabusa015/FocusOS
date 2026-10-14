import { defineConfig } from 'vitest/config';

// Opt-in tests against the real Anthropic, Google and VoiceStudio services (PLAN §14).
// They are never part of `npm test` or CI.
export default defineConfig({
  test: { include: ['tests/live/**/*.test.ts'], environment: 'node', passWithNoTests: true },
});
