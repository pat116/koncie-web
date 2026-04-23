/**
 * Booking supertype + concrete subtypes.
 *
 * Koncie renders FlightBooking and HotelBooking into a single Itinerary,
 * but **never processes either transaction** — flights stay in Jet Seeker,
 * rooms stay in HotelLink (see CLAUDE.md non-negotiable #1).
 *
 * Stubbed for Sprint 0. Real shape lands in Sprint 2/3 when webhook
 * ingestion starts.
 */

export type BookingKind = 'flight' | 'hotel';

export interface BookingBase {
  id: string;
  kind: BookingKind;
  guestEmail: string;
  /** External reference in the source system (Jet Seeker order id, HotelLink booking id, etc.) */
  externalId: string;
  /** ISO-8601 timestamp */
  createdAt: string;
}

export interface FlightBooking extends BookingBase {
  kind: 'flight';
  /** e.g. 'JetSeeker' — drives the "Powered by …" label */
  provider: string;
}

export interface HotelBooking extends BookingBase {
  kind: 'hotel';
  /** e.g. 'HotelLink' — drives the "Powered by …" label */
  provider: string;
}

export type Booking = FlightBooking | HotelBooking;
