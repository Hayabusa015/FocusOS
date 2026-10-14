import { z } from 'zod';
import { minutesOfDay } from '@shared/dates';
import { AppSettings, DEFAULT_SETTINGS } from '@shared/core';
import type { AppSettingsPatch } from '@shared/core';
import type { KeyValueStore } from './settings';

const KEY = 'app.settings';

/** The user's preferences, always complete: whatever was never set falls back to its default. */
export function readSettings(store: KeyValueStore): AppSettings {
  const saved = store.get(KEY, z.record(z.string(), z.unknown())) ?? {};
  const merged = AppSettings.safeParse({ ...DEFAULT_SETTINGS, ...saved });
  return merged.success ? merged.data : { ...DEFAULT_SETTINGS };
}

export function writeSettings(store: KeyValueStore, patch: AppSettingsPatch): AppSettings {
  const next = AppSettings.parse({ ...readSettings(store), ...patch });
  if (minutesOfDay(next.dayEnd) <= minutesOfDay(next.dayStart)) {
    throw new Error('The day has to end after it starts');
  }
  store.set(KEY, next);
  return next;
}
