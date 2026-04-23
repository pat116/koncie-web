/**
 * Common shape returned by any partner (HotelLink, SiteMinder, Opera, ...)
 * when we ingest a booking. Maps cleanly onto our internal `Booking` row.
 */
export interface ExternalBooking {
  externalRef: string;
  propertySlug: string;
  guest: {
    email: string;
    firstName: string;
    lastName: string;
  };
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
}

export interface WebhookResult {
  accepted: boolean;
  externalRef?: string;
  reason?: string;
}

/**
 * All partner integrations (real + mock) implement this port.
 * Swap implementations without touching app code.
 *
 * Sprint 1 ships the mock implementation (`HotelLinkMockAdapter`).
 * Sprint 7 replaces it with a real HotelLink HTTP adapter.
 */
export interface PartnerAdapter {
  listBookings(propertySlug: string): Promise<ExternalBooking[]>;
  getBooking(externalRef: string): Promise<ExternalBooking | null>;
  onWebhook(payload: unknown): Promise<WebhookResult>;
}
