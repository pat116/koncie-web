/**
 * Typed error classes used across Sprint 1 auth + data paths.
 * Each has a distinct Sentry level (see docs/auth.md § "Security notes").
 */

export class SignedLinkError extends Error {
  constructor(
    public readonly reason:
      | 'expired'
      | 'invalid_signature'
      | 'email_mismatch'
      | 'malformed',
  ) {
    super(`Signed link error: ${reason}`);
    this.name = 'SignedLinkError';
  }
}

export class BookingNotFoundError extends Error {
  constructor(public readonly externalRef: string) {
    super(`Booking not found: ${externalRef}`);
    this.name = 'BookingNotFoundError';
  }
}

export class AuthSessionError extends Error {
  constructor(public readonly reason: 'no_session' | 'refresh_failed') {
    super(`Auth session error: ${reason}`);
    this.name = 'AuthSessionError';
  }
}

export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Database unavailable');
    this.name = 'DatabaseUnavailableError';
    if (cause) this.cause = cause;
  }
}
