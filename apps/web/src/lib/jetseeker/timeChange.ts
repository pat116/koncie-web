/**
 * JetSeeker time-change processor (Sprint-6 completion §3.S6-08).
 *
 * Sprint-6 ships scaffold + mock harness only. Live wire-up belongs to
 * the broader Sprint-7 data-model push, when the Symfony team confirms
 * the contract specifics. The shape here matches the inferred contract
 * from the original 2026-04-25 brief §3.S6-08.
 *
 * Idempotency: dedupe on `(jetseeker_order_id, occurred_at)`. We surface
 * this as a `providerEventKey = ${jetseekerOrderId}:${occurredAt}` and
 * persist it on the Notification metadata. Retried webhooks produce
 * exactly one notification.
 */

import * as crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { createFlightTimeChangedNotification } from '@/lib/notifications/service';

export const timeChangePayloadSchema = z.object({
  event: z.literal('flight.time_changed'),
  occurred_at: z.string(),
  flight_booking: z.object({
    jetseeker_order_id: z.union([z.string(), z.number()]),
    guest_email: z.string().email(),
    pnr: z.string(),
    carrier: z.string(),
    old_departure_local: z.string(),
    new_departure_local: z.string(),
    old_arrival_local: z.string().optional(),
    new_arrival_local: z.string().optional(),
    reason_code: z.string().optional(),
  }),
});

export type TimeChangePayload = z.infer<typeof timeChangePayloadSchema>;

export type TimeChangeOutcome =
  | { kind: 'notified'; notificationCreated: boolean; bookingId: string }
  | { kind: 'queued'; reason: 'unknown_pnr_or_email' };

/**
 * Verify HMAC-SHA256 signature against KONCIE_JETSEEKER_WEBHOOK_SECRET. The
 * signature is computed over the raw request body — caller passes the raw
 * body string (not the parsed JSON).
 */
export function verifyJetSeekerSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!input.signatureHeader || !input.secret) return false;
  const expected = crypto
    .createHmac('sha256', input.secret)
    .update(input.rawBody)
    .digest('hex');
  // Compare in constant time when length matches; otherwise fail fast.
  if (input.signatureHeader.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(input.signatureHeader, 'utf-8'),
    Buffer.from(expected, 'utf-8'),
  );
}

export async function applyJetSeekerTimeChange(
  payload: TimeChangePayload,
): Promise<TimeChangeOutcome> {
  const { flight_booking: fb, occurred_at } = payload;
  const orderId = String(fb.jetseeker_order_id);
  const providerEventKey = `${orderId}:${occurred_at}`;

  // Resolve the FlightBooking by (guestEmail → guestId) + pnr-in-rawPayload.
  // For Sprint-6 scaffold we accept either a metadata-pnr match or the
  // FlightBooking.externalRef as a stand-in. Live wire-up will use the
  // FlightBooking.pnr column added in the Sprint-7 data-model push.
  const guest = await prisma.guest.findUnique({
    where: { email: fb.guest_email },
    select: { id: true },
  });
  if (!guest) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  const flight = await prisma.flightBooking.findFirst({
    where: {
      guestId: guest.id,
      OR: [{ externalRef: fb.pnr }],
    },
  });
  if (!flight) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  // Resolve a Booking for the same guest. The notification model is
  // booking-scoped; pick the next upcoming hotel booking. For pilot
  // demos this is the only HotelBooking the guest has.
  const booking = await prisma.booking.findFirst({
    where: { guestId: guest.id, status: 'CONFIRMED' },
    orderBy: { checkIn: 'asc' },
  });
  if (!booking) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  const created = await createFlightTimeChangedNotification({
    booking,
    flight,
    oldDepartureLocal: fb.old_departure_local,
    newDepartureLocal: fb.new_departure_local,
    reasonCode: fb.reason_code,
    providerEventKey,
  });

  return { kind: 'notified', notificationCreated: created, bookingId: booking.id };
}
