import type { Booking } from './bookings.js';

/**
 * A guest's unified trip view — flights + hotels + ancillaries on one timeline.
 * Owned by Koncie; the underlying bookings are owned by Jet Seeker and HotelLink.
 *
 * Stubbed for Sprint 0.
 */
export interface Itinerary {
  id: string;
  guestId: string;
  bookings: Booking[];
  /** ISO-8601 timestamps */
  tripStart: string;
  tripEnd: string;
}
