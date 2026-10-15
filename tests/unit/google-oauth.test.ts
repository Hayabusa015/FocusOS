import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newPkce, runLoopbackSignIn } from '../../src/main/google/oauth';

/** Plays the browser: opens the address Cortex built, then "Google" redirects to the loopback. */
const browser = (respond: (redirectUri: string, state: string) => Promise<unknown> | unknown) => ({
  open: async (url: string) => {
    const u = new URL(url);
    void Promise.resolve(
      respond(u.searchParams.get('redirect_uri')!, u.searchParams.get('state')!),
    );
  },
});

const buildUrl = ({
  redirectUri,
  state,
  codeChallenge,
}: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) =>
  `https://accounts.example/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}`;

const exchangeOk = async () => ({ refreshToken: 'r' });

describe('Google sign-in over a loopback address (PLAN §9.2)', () => {
  it('uses PKCE: the challenge is the SHA-256 of the verifier', () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(newPkce().verifier).not.toBe(verifier);
  });

  it('redirects to 127.0.0.1 on a random port and trades the code and verifier for a token', async () => {
    let exchanged: { code: string; codeVerifier: string; redirectUri: string } | null = null;
    let challenge = '';
    const b = browser((redirect, state) => fetch(`${redirect}/?code=abc123&state=${state}`));
    const tokens = await runLoopbackSignIn({
      openUrl: b.open,
      buildUrl: (args) => {
        challenge = args.codeChallenge;
        return buildUrl(args);
      },
      exchange: async (args) => {
        exchanged = args;
        return { refreshToken: 'refresh-1' };
      },
    });
    expect(tokens).toEqual({ refreshToken: 'refresh-1' });
    expect(exchanged!.code).toBe('abc123');
    expect(exchanged!.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(createHash('sha256').update(exchanged!.codeVerifier).digest('base64url')).toBe(
      challenge,
    );
  });

  it('ignores an answer with the wrong state, then accepts the real one', async () => {
    let exchanged = '';
    const b = browser(async (redirect, state) => {
      const wrong = await fetch(`${redirect}/?code=evil&state=not-it`);
      expect(wrong.status).toBe(400);
      await fetch(`${redirect}/?code=good&state=${state}`);
    });
    await runLoopbackSignIn({
      openUrl: b.open,
      buildUrl,
      exchange: async ({ code }) => {
        exchanged = code;
        return { refreshToken: 'r' };
      },
    });
    expect(exchanged).toBe('good');
  });

  it('only answers on the root path', async () => {
    let status = 0;
    const b = browser(async (redirect, state) => {
      status = (await fetch(`${redirect}/favicon.ico`)).status;
      await fetch(`${redirect}/?code=ok&state=${state}`);
    });
    await runLoopbackSignIn({ openUrl: b.open, buildUrl, exchange: exchangeOk });
    expect(status).toBe(404);
  });

  it('says so when the user cancels in the browser', async () => {
    const b = browser((redirect, state) =>
      fetch(`${redirect}/?error=access_denied&state=${state}`),
    );
    await expect(
      runLoopbackSignIn({ openUrl: b.open, buildUrl, exchange: exchangeOk }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('gives up if the user never comes back', async () => {
    await expect(
      runLoopbackSignIn({
        openUrl: () => undefined,
        buildUrl,
        exchange: exchangeOk,
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/too long/i);
  });

  it('fails cleanly if the browser cannot be opened', async () => {
    await expect(
      runLoopbackSignIn({
        openUrl: () => {
          throw new Error('no browser');
        },
        buildUrl,
        exchange: exchangeOk,
      }),
    ).rejects.toThrow('no browser');
  });
});
