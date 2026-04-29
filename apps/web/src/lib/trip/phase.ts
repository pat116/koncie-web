/**
 * Sprint 7 — Trip phase derivation (S7-10).
 *
 * Pure function. Maps (HotelBooking.status, checkIn, checkOut, Property
 * timezone, now) → TripPhase per spec doc §6.2.
 *
 * Default check-in / check-out times are constants here per kickoff §6 #5
 * lock — Sprint 8 introduces Property.defaultCheckInTime / -OutTime fields.
 */

import type { TripPhase } from '@prisma/client';

/** Spec doc §6.2: defaults until Property exposes them. */
export const DEFAULT_CHECK_IN_LOCAL = '15:00';
export const DEFAULT_CHECK_OUT_LOCAL = '11:00';

export interface DerivePhaseInput {
  hotelBookingStatus: string; // BookingStatus enum value
  checkIn: Date;              // Prisma @db.Date — midnight UTC of date
  checkOut: Date;
  propertyTimezone: string;   // IANA, e.g. "Pacific/Fiji"
  now?: Date;                 // injectable for tests
  checkInLocal?: string;      // hh:mm; defaults to 15:00
  checkOutLocal?: string;     // hh:mm; defaults to 11:00
}

/**
 * Compute the UTC instant at which a wall-clock reading of `hhmm` happens
 * in `timezone` on the same calendar day as `dateAtUtcMidnight`.
 *
 * Without a tz library: use Intl.DateTimeFormat to discover the tz offset
 * at the candidate instant, then subtract.
 */
export function localDateAtTz(
  dateAtUtcMidnight: Date,
  hhmm: string,
  timezone: string,
): Date {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  const y = dateAtUtcMidnight.getUTCFullYear();
  const mo = dateAtUtcMidnight.getUTCMonth();
  const d = dateAtUtcMidnight.getUTCDate();
  // Naive: treat the local clock reading as if it were UTC.
  const naiveUtc = Date.UTC(y, mo, d, h, m);
  // What does that naive UTC instant *render as* in the target timezone?
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naiveUtc));
  const get = (t: string): number => {
    const p = parts.find((q) => q.type === t);
    if (!p) throw new Error(`localDateAtTz: missing part ${t}`);
    return parseInt(p.value, 10);
  };
  const tzAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'), // Intl returns 24 for midnight in some locales
    get('minute'),
  );
  // offset > 0 iff timezone is ahead of UTC.
  const offset = tzAsUtc - naiveUtc;
  return new Date(naiveUtc - offset);
}

export function derivePhase(input: DerivePhaseInput): TripPhase {
  const {
    hotelBookingStatus,
    checkIn,
    checkOut,
    propertyTimezone,
    now = new Date(),
    checkInLocal = DEFAULT_CHECK_IN_LOCAL,
    checkOutLocal = DEFAULT_CHECK_OUT_LOCAL,
  } = input;

  if (hotelBookingStatus !== 'CONFIRMED') {
    return 'PRE_CONFIRMATION';
  }

  const checkInUtc = localDateAtTz(checkIn, checkInLocal, propertyTimezone);
  const checkOutUtc = localDateAtTz(checkOut, checkOutLocal, propertyTimezone);

  if (now.getTime() < checkInUtc.getTime()) return 'PRE_ARRIVAL';
  if (now.getTime() <= checkOutUtc.getTime()) return 'IN_STAY';
  return 'POST_STAY';
}
