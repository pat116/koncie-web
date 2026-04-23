import type { PaymentFailureReason } from '@koncie/types';

/**
 * Business-outcome errors (declines, validation). Shown to guest, NOT sent to Sentry.
 * Thrown by the checkout server action to short-circuit out of the happy path.
 */
export class PaymentDeclinedError extends Error {
  readonly reason: PaymentFailureReason;
  constructor(reason: PaymentFailureReason, message: string) {
    super(message);
    this.name = 'PaymentDeclinedError';
    this.reason = reason;
  }
}

export class PaymentValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'PaymentValidationError';
    this.field = field;
  }
}

/**
 * Infra-broken errors. Sent to Sentry; guest sees a generic "try again later".
 */
export class PaymentProviderUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PaymentProviderUnavailableError';
  }
}

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}
