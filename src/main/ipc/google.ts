import { CHANNELS } from '@shared/channels';
import { EmailAccept, EmailDismiss, GoogleCalendarChoice, GoogleConnect } from '@shared/google';
import { EmptyRequest as Empty } from '@shared/schemas';
import type { GoogleService } from '../google/service';
import { handle } from './handle';
import type { TrustCheck } from './handle';

/**
 * Registers the Google channels. Every payload is validated before the handler sees it, and the
 * renderer only ever gets views: never a token, a client secret or a message body.
 */
export function registerGoogleIpc(deps: {
  google: GoogleService;
  isTrustedSender: TrustCheck;
}): void {
  const { google, isTrustedSender: trust } = deps;
  handle(CHANNELS.googleStatus, Empty, () => google.status(), trust);
  handle(CHANNELS.googleConnect, GoogleConnect, (input) => google.connect(input), trust);
  handle(CHANNELS.googleReconnect, Empty, () => google.reconnect(), trust);
  handle(CHANNELS.googleDisconnect, Empty, () => google.disconnect(), trust);
  handle(
    CHANNELS.googleCalendars,
    GoogleCalendarChoice,
    ({ ids }) => google.setCalendars(ids),
    trust,
  );
  handle(CHANNELS.googleSync, Empty, () => google.syncNow(), trust);
  handle(CHANNELS.googleEmailCheck, Empty, () => google.checkEmail(true), trust);
  handle(CHANNELS.googleEmailList, Empty, () => google.suggestions(), trust);
  handle(CHANNELS.googleEmailAccept, EmailAccept, (input) => google.accept(input), trust);
  handle(CHANNELS.googleEmailDismiss, EmailDismiss, ({ id }) => google.dismiss(id), trust);
}
