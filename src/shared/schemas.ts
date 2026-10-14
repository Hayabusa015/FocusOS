import { z } from 'zod';

/** Request and response shapes for every IPC channel. Validated in the main process. */

export const EmptyRequest = z.void();

export const AppInfo = z.object({
  name: z.string(),
  version: z.string(),
  dataDir: z.string(),
  isPackaged: z.boolean(),
  platform: z.string(),
});
export type AppInfo = z.infer<typeof AppInfo>;

export const UpdaterStatus = z.enum([
  'disabled',
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'up-to-date',
  'error',
]);
export type UpdaterStatus = z.infer<typeof UpdaterStatus>;

export const UpdaterState = z.object({
  status: UpdaterStatus,
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  /** Raw release notes from the release feed: HTML or markdown. Sanitised in the renderer. */
  releaseNotes: z.string().nullable(),
  progressPercent: z.number().min(0).max(100).nullable(),
  lastCheckedAt: z.string().nullable(),
  /** The available update is hidden until this moment ("Later"). */
  snoozedUntil: z.string().nullable(),
  /** True while a focus session, ritual or recording means a restart would interrupt. */
  busy: z.boolean(),
  error: z.string().nullable(),
  /** Why updates are off, when status is `disabled`. */
  disabledReason: z.string().nullable(),
  /** Set once after an update: the version just installed and its notes. */
  justUpdated: z.object({ version: z.string(), releaseNotes: z.string().nullable() }).nullable(),
});
export type UpdaterState = z.infer<typeof UpdaterState>;

export const SnoozeRequest = z.object({ version: z.string().min(1) });
export type SnoozeRequest = z.infer<typeof SnoozeRequest>;
