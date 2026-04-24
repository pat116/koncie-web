/**
 * Infra-broken error for the InsuranceQuoteSource adapter (CoverMore sandbox
 * timeout, 5xx, auth failure). Sentry-captured; guest sees no insurance offer
 * card in the hub rather than a broken UI.
 *
 * Mirrors the Sprint 3 JetSeekerUnavailableError pattern. Business outcomes
 * (no valid trip context to quote against) are NOT errors — they short-circuit
 * before the adapter is called.
 */
export class CoverMoreUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'CoverMoreUnavailableError';
  }
}
