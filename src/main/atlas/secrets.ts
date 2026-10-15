import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

/**
 * Where the Anthropic API key lives (PLAN §12). It is encrypted with the operating system's key
 * store (Electron `safeStorage`, which is Windows DPAPI on the user's PC) and kept in its own
 * file. It never goes in the database, a log, or anything sent to the renderer.
 */
export interface SecretStore {
  /** Whether secrets can be stored safely on this machine. */
  available(): boolean;
  get(): string | null;
  set(key: string): void;
  clear(): void;
}

/** The part of Electron's `safeStorage` this needs, so tests can stand in for it. */
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

const FileShape = z.object({ anthropicKey: z.string() });

/** An Anthropic key looks like `sk-ant-...`. This catches a paste of the wrong thing, no more. */
export function looksLikeAnthropicKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export function createFileSecretStore(path: string, cipher: Cipher): SecretStore {
  return {
    available: () => cipher.isEncryptionAvailable(),
    get() {
      if (!cipher.isEncryptionAvailable() || !existsSync(path)) return null;
      try {
        const parsed = FileShape.safeParse(JSON.parse(readFileSync(path, 'utf8')));
        if (!parsed.success) return null;
        return cipher.decryptString(Buffer.from(parsed.data.anthropicKey, 'base64'));
      } catch {
        return null; // A file from another user account or machine cannot be read; treat as unset.
      }
    },
    set(key) {
      if (!cipher.isEncryptionAvailable()) {
        throw new Error('This PC cannot store a key securely, so Cortex will not save one.');
      }
      mkdirSync(dirname(path), { recursive: true });
      const body = { anthropicKey: cipher.encryptString(key.trim()).toString('base64') };
      writeFileSync(path, JSON.stringify(body), { mode: 0o600 });
    },
    clear() {
      if (existsSync(path)) writeFileSync(path, JSON.stringify({}), { mode: 0o600 });
    },
  };
}

/** For tests and for the fake Atlas: holds the key in memory only. */
export function createMemorySecretStore(initial: string | null = null): SecretStore {
  let key = initial;
  return {
    available: () => true,
    get: () => key,
    set: (value) => {
      key = value.trim();
    },
    clear: () => {
      key = null;
    },
  };
}
