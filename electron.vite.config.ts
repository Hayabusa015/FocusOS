import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildCsp } from './src/shared/csp';

/**
 * Pages loaded from file:// never pass through the response-header hook, so the strict
 * Content Security Policy is also written into the built index.html. One definition: buildCsp.
 */
function strictCspMeta(): Plugin {
  return {
    name: 'cortex-strict-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(false) },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  preload: {
    // The preload script runs sandboxed, so it must be fully bundled: it may import
    // only from `electron` and from files in this repository, never from node_modules.
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  renderer: {
    plugins: [react(), tailwindcss(), strictCspMeta()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer') } },
  },
});
