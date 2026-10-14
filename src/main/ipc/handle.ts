import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';

/**
 * The one way to register an IPC handler.
 *
 * - The payload is validated with Zod before the handler sees it.
 * - Only frames served by the app itself may call in (`isTrustedSender`).
 * - A validation or handler error rejects the renderer's promise with a plain message.
 */
export type TrustCheck = (event: Pick<IpcMainInvokeEvent, 'senderFrame'>) => boolean;

export function makeHandler<S extends z.ZodType, R>(
  schema: S,
  fn: (payload: z.infer<S>, event: IpcMainInvokeEvent) => Promise<R> | R,
  isTrustedSender: TrustCheck,
): (event: IpcMainInvokeEvent, payload: unknown) => Promise<R> {
  return async (event, payload) => {
    if (!isTrustedSender(event)) throw new Error('Blocked: this window may not call Cortex.');
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid request: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    return fn(parsed.data, event);
  };
}

export function handle<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (payload: z.infer<S>, event: IpcMainInvokeEvent) => Promise<R> | R,
  isTrustedSender: TrustCheck,
): void {
  ipcMain.handle(channel, makeHandler(schema, fn, isTrustedSender));
}
