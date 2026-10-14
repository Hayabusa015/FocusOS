/** Content Security Policy for the renderer (PLAN §12). The packaged app gets the strict one. */
export function buildCsp(dev: boolean): string {
  const directives = dev
    ? [
        "default-src 'self'",
        // Vite's React refresh injects an inline script and talks to the dev server.
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws://localhost:* http://localhost:*",
        "img-src 'self' data:",
      ]
    : [
        "default-src 'self'",
        "script-src 'self'",
        // Inline style attributes (for example a progress bar's width) are allowed; inline script is not.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
      ];
  return directives.join('; ');
}
