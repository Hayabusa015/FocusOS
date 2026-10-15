import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Cipher } from '../atlas/secrets';

/**
 * The Google client secret and refresh token (PLAN §12). Encrypted with the operating system's key
 * store (Electron `safeStorage`), kept in their own file, never in the database, a log or anything
 * sent to the renderer. The client ID is not secret and lives in settings.
 */
export interface GoogleSecrets {
  available(): boolean;
  clientSecret(): string | null;
  refreshToken(): string | null;
  setClientSecret(value: string): void;
  setRefreshToken(value: string): void;
  /** Forgets the refresh token only (a sign-out): the client secret stays for signing in again. */
  clearRefreshToken(): void;
  clear(): void;
}

const FileShape = z.object({
  clientSecret: z.string().optional(),
  refreshToken: z.string().optional(),
});
type FileShape = z.infer<typeof FileShape>;

export function createFileGoogleSecrets(path: string, cipher: Cipher): GoogleSecrets {
  const read = (): FileShape => {
    if (!existsSync(path)) return {};
    try {
      const parsed = FileShape.safeParse(JSON.parse(readFileSync(path, 'utf8')));
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  };
  const open = (value: string | undefined): string | null => {
    if (!value || !cipher.isEncryptionAvailable()) return null;
    try {
      return cipher.decryptString(Buffer.from(value, 'base64'));
    } catch {
      return null; // From another account or machine: treat as not saved.
    }
  };
  const write = (next: FileShape) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next), { mode: 0o600 });
  };
  const seal = (value: string) => {
    if (!cipher.isEncryptionAvailable()) {
      throw new Error('This PC cannot store a secret safely, so Cortex will not save one.');
    }
    return cipher.encryptString(value.trim()).toString('base64');
  };
  return {
    available: () => cipher.isEncryptionAvailable(),
    clientSecret: () => open(read().clientSecret),
    refreshToken: () => open(read().refreshToken),
    setClientSecret: (value) => write({ ...read(), clientSecret: seal(value) }),
    setRefreshToken: (value) => write({ ...read(), refreshToken: seal(value) }),
    clearRefreshToken: () => {
      const { refreshToken: _gone, ...rest } = read();
      write(rest);
    },
    clear: () => {
      if (existsSync(path)) write({});
    },
  };
}

/** For tests and the fake Google: in memory only. */
export function createMemoryGoogleSecrets(): GoogleSecrets {
  let secret: string | null = null;
  let token: string | null = null;
  return {
    available: () => true,
    clientSecret: () => secret,
    refreshToken: () => token,
    setClientSecret: (v) => {
      secret = v.trim();
    },
    setRefreshToken: (v) => {
      token = v.trim();
    },
    clearRefreshToken: () => {
      token = null;
    },
    clear: () => {
      secret = null;
      token = null;
    },
  };
}
