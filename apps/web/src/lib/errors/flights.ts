/**
 * Infra-broken error for the FlightItinerarySource adapter (Jet Seeker timeout,
 * 5xx, auth failure). Sentry-captured; guest sees a soft-fail banner in the
 * flight-card slot.
 *
 * Mirrors the Sprint 2 PaymentProviderUnavailableError pattern. Business
 * outcomes (empty itinerary for guest) are NOT errors — they return [].
 */
export class JetSeekerUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'JetSeekerUnavailableError';
  }
}
