import Anthropic from '@anthropic-ai/sdk';

/**
 * Atlas problems, in plain words for the screen. Atlas being down never breaks the rest of the app:
 * these are shown in the Atlas panel and nowhere else.
 */
export class AtlasError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'cap' | 'unavailable' | 'refused' | 'bad-key' | 'invalid',
  ) {
    super(message);
    this.name = 'AtlasError';
  }
}

export const noKey = () =>
  new AtlasError('Atlas needs your Anthropic API key. Add it in Settings.', 'no-key');

export const capReached = (spent: number, cap: number) =>
  new AtlasError(
    `You have reached this month's Atlas spending cap ($${cap.toFixed(2)}; about $${spent.toFixed(2)} spent). Raise it in Settings, or wait for next month. The rest of Cortex keeps working.`,
    'cap',
  );

/** Turns anything thrown by the SDK into one clear message. Most specific first. */
export function describeError(error: unknown): AtlasError {
  if (error instanceof AtlasError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AtlasError('Anthropic did not accept the API key. Check it in Settings.', 'bad-key');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AtlasError(`Atlas could not make that request: ${error.message}`, 'invalid');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AtlasError(
      'Atlas is unavailable right now (rate limited). Try again in a minute.',
      'unavailable',
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AtlasError(
      'Atlas is unavailable: Cortex could not reach Anthropic. Check the connection.',
      'unavailable',
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AtlasError(
      `Atlas is unavailable right now (error ${error.status ?? 'unknown'}).`,
      'unavailable',
    );
  }
  return new AtlasError('Atlas ran into a problem. Try again.', 'unavailable');
}
