/**
 * Every IPC channel name, in one place.
 *
 * This file imports nothing, so the sandboxed preload script can bundle it safely.
 * The request and response shapes for each channel live in `schemas.ts`.
 */
export const CHANNELS = {
  appInfo: 'app:info',
  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterSnooze: 'updater:snooze',
  updaterDismissUpdated: 'updater:dismiss-updated',
} as const;

/** Main → renderer push channels. */
export const EVENTS = {
  updaterState: 'updater:state',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
