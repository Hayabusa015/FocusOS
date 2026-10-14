import { app } from 'electron';
import { CHANNELS } from '@shared/channels';
import { AppInfo, EmptyRequest, SnoozeRequest } from '@shared/schemas';
import type { UpdaterController } from '../domain/updater-controller';
import { handle } from './handle';
import type { TrustCheck } from './handle';

export interface IpcDeps {
  updater: UpdaterController;
  dataDir: string;
  isTrustedSender: TrustCheck;
}

/** Registers every channel. One handler per channel, every payload validated (PLAN §12). */
export function registerIpc({ updater, dataDir, isTrustedSender }: IpcDeps): void {
  handle(
    CHANNELS.appInfo,
    EmptyRequest,
    () =>
      AppInfo.parse({
        name: app.getName(),
        version: app.getVersion(),
        dataDir,
        isPackaged: app.isPackaged,
        platform: process.platform,
      }),
    isTrustedSender,
  );
  handle(CHANNELS.updaterGetState, EmptyRequest, () => updater.getState(), isTrustedSender);
  handle(CHANNELS.updaterCheck, EmptyRequest, () => updater.check(true), isTrustedSender);
  handle(CHANNELS.updaterDownload, EmptyRequest, () => updater.download(), isTrustedSender);
  handle(CHANNELS.updaterInstall, EmptyRequest, () => updater.install(), isTrustedSender);
  handle(
    CHANNELS.updaterSnooze,
    SnoozeRequest,
    ({ version }) => updater.snooze(version),
    isTrustedSender,
  );
  handle(
    CHANNELS.updaterDismissUpdated,
    EmptyRequest,
    () => updater.dismissUpdated(),
    isTrustedSender,
  );
}
