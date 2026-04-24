/**
 * FlightItinerarySource port. Sprint 3 has one adapter (JetSeekerMockAdapter);
 * a later sprint swaps in a real Jet Seeker wrapper. Read-only: Koncie does
 * not book flights — flight booking lives inside Jet Seeker's OTA.
 *
 * See docs/flights.md for the port contract and swap-in guide.
 */

export interface FlightBookingRead {
  /** Jet Seeker PNR (e.g. "JS-ABC123"). Unique per guest. */
  externalRef: string;
  guestEmail: string;
  /** IATA airport code, 3 chars (e.g. "SYD") */
  origin: string;
  /** IATA airport code, 3 chars (e.g. "NAN") */
  destination: string;
  /** ISO-8601 with timezone */
  departureAt: string;
  /** ISO-8601 with timezone; null for one-way */
  returnAt: string | null;
  /** IATA airline code, 2 chars (e.g. "FJ") */
  carrier: string;
  /** Adapter-specific fields we don't yet model (passenger count, class, etc.) */
  metadata: Record<string, unknown>;
}

export interface FlightItinerarySource {
  fetchBookingsForGuest(email: string): Promise<FlightBookingRead[]>;
}
