/**
 * A registered Koncie user. Identity is linked to bookings via email for MVP
 * (see plan addendum §6.1 Q1 — email-based account linking).
 *
 * Stubbed for Sprint 0. Real fields are filled in during Sprint 1 auth work.
 */
export interface Guest {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** ISO-8601 timestamp */
  createdAt: string;
}
