import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Tokens } from './types';

/**
 * Signing in the way Google asks desktop apps to (PLAN §9.2): a loopback redirect on
 * `http://127.0.0.1:<random port>`, with PKCE and a `state` check. The browser opens Google's
 * page; Google sends the browser back to the loopback address with a code; Cortex trades the code
 * (and the PKCE verifier) for a refresh token. This file knows nothing about Google's library, so
 * a test can play the browser.
 */
export interface LoopbackSignIn {
  /** The Google sign-in page address for this attempt. */
  buildUrl(args: { redirectUri: string; state: string; codeChallenge: string }): string;
  exchange(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<Tokens>;
  /** Opens the address in the user's browser. */
  openUrl(url: string): Promise<void> | void;
  /** How long to wait for the user. Default five minutes. */
  timeoutMs?: number;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>Cortex</title>` +
  `<body style="font-family:system-ui;color-scheme:light dark;display:grid;place-items:center;height:100vh;margin:0">` +
  `<div style="max-width:28rem;text-align:center"><h1 style="font-weight:600">${title}</h1><p>${body}</p></div></body>`;

export async function runLoopbackSignIn(options: LoopbackSignIn): Promise<Tokens> {
  const { verifier, challenge } = newPkce();
  const state = base64url(randomBytes(24));
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;

  let server: Server | null = null;
  let redirect = '';
  const close = () => {
    server?.close();
    server?.closeAllConnections();
    server = null;
  };

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Sign-in took too long. Try again.'));
    }, timeoutMs);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const back = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const got = url.searchParams.get('code');
      // Anything that is not Google's answer to this attempt is ignored, never trusted.
      if (back !== state || (!got && !error)) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(PAGE('Not for Cortex', 'Ignored.'));
        return;
      }
      if (error || !got) {
        res
          .writeHead(200, { 'content-type': 'text/html' })
          .end(PAGE('Sign-in cancelled', 'You can close this tab and go back to Cortex.'));
        done(() => reject(new Error('Sign-in was cancelled in the browser.')));
        return;
      }
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(PAGE('Cortex is connected', 'You can close this tab and go back to Cortex.'));
      done(() => resolve(got));
    });
    server.on('error', (e) => done(() => reject(e)));
    server.listen(0, '127.0.0.1', () => {
      const port = (server?.address() as AddressInfo).port;
      const redirectUri = `http://127.0.0.1:${port}`;
      redirect = redirectUri;
      // Inside a promise, so an address that cannot be built or opened (even instantly) is a failed
      // sign-in, not an uncaught error.
      Promise.resolve()
        .then(() =>
          options.openUrl(options.buildUrl({ redirectUri, state, codeChallenge: challenge })),
        )
        .catch((e: unknown) => done(() => reject(e instanceof Error ? e : new Error(String(e)))));
    });
  }).finally(close);

  return options.exchange({ code, codeVerifier: verifier, redirectUri: redirect });
}
