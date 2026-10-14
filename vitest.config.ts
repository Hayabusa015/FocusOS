import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Every date test pins the clock; this keeps the machine timezone out of it (PLAN §14).
    env: { TZ: 'America/New_York' },
  },
});
