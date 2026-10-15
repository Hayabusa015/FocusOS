import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Cipher } from '../../src/main/atlas/secrets';
import { createFileGoogleSecrets } from '../../src/main/google/secrets';

/** A stand-in for Windows' key store: reversible, but not readable as plain text. */
const cipher = (available = true): Cipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
  decryptString: (data) => {
    const text = data.toString();
    if (!text.startsWith('enc:')) throw new Error('not ours');
    return [...text.slice(4)].reverse().join('');
  },
});

const file = () => join(mkdtempSync(join(tmpdir(), 'cortex-g-')), 'google-secrets.json');

describe('Google secrets (PLAN §12)', () => {
  it('keeps the client secret and refresh token encrypted, never as plain text', () => {
    const path = file();
    const secrets = createFileGoogleSecrets(path, cipher());
    secrets.setClientSecret('GOCSPX-very-secret');
    secrets.setRefreshToken('1//refresh-token-value');
    const raw = readFileSync(path, 'utf8');
    expect(raw).not.toContain('GOCSPX-very-secret');
    expect(raw).not.toContain('1//refresh-token-value');
    expect(secrets.clientSecret()).toBe('GOCSPX-very-secret');
    expect(secrets.refreshToken()).toBe('1//refresh-token-value');
  });

  it('a sign-out forgets the token but keeps the secret, and clear forgets both', () => {
    const secrets = createFileGoogleSecrets(file(), cipher());
    secrets.setClientSecret('s');
    secrets.setRefreshToken('t');
    secrets.clearRefreshToken();
    expect(secrets.refreshToken()).toBeNull();
    expect(secrets.clientSecret()).toBe('s');
    secrets.clear();
    expect(secrets.clientSecret()).toBeNull();
  });

  it('refuses to save when the PC cannot protect it, and reads nothing back', () => {
    const secrets = createFileGoogleSecrets(file(), cipher(false));
    expect(secrets.available()).toBe(false);
    expect(() => secrets.setRefreshToken('t')).toThrow(/cannot store a secret safely/);
    expect(secrets.refreshToken()).toBeNull();
  });

  it('treats a file it cannot decrypt (another account) as nothing saved', () => {
    const path = file();
    createFileGoogleSecrets(path, cipher()).setRefreshToken('t');
    const broken: Cipher = {
      ...cipher(),
      decryptString: () => {
        throw new Error('wrong user');
      },
    };
    expect(createFileGoogleSecrets(path, broken).refreshToken()).toBeNull();
  });
});
