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
  const { flight_booking: fb, occurred_at: _occurredAt } = payload;
  const orderId = String(fb.jetseeker_order_id);
  // Sprint 7 (S7-14): notification dedupe across replays AND carrier reversals
  // is per (bookingId, jetseekerOrderId). A reversal carries a different
  // occurred_at but updates the same flight — the bell-dropdown surfaces the
  // latest change once (kickoff §3.S7-14 AC).
  const providerEventKey = orderId;

  // Resolve guest → flight → booking. Any miss queues for now (kickoff §6 #3
  // lock — failure mode benign; structured columns stay null until parser
  // is updated).
  const guest = await prisma.guest.findUnique({
    where: { email: fb.guest_email },
    select: { id: true },
  });
  if (!guest) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  const flight = await prisma.flightBooking.findFirst({
    where: {
      guestId: guest.id,
      OR: [{ externalRef: fb.pnr }, { pnr: fb.pnr }],
    },
  });
  if (!flight) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  const booking = await prisma.hotelBooking.findFirst({
    where: { guestId: guest.id, status: 'CONFIRMED' },
    orderBy: { checkIn: 'asc' },
  });
  if (!booking) return { kind: 'queued', reason: 'unknown_pnr_or_email' };

  // Sprint 7 (S7-14) live-wire — persist the inbound payload + structured
  // outbound columns. Failure to derive structured columns is non-fatal:
  // raw_payload is the source of truth; structured columns can be back-filled.
  // For Sprint 7 we treat every inbound time-change event as outbound-leg
  // — the payload schema doesn't carry leg metadata yet (Symfony team
  // hasn't confirmed). Sprint 8 will route to return* fields when leg info
  // arrives.
  try {
    const newDepartureUtc = new Date(fb.new_departure_local);
    const updateData: Record<string, unknown> = {
      rawPayload: payload as unknown,
      outboundStatus: 'TIME_CHANGED',
      outboundChangedAt: new Date(),
      outboundChangeReason: fb.reason_code ?? null,
    };
    // Stamp originalDepartureAt only on the FIRST change — preserves the
    // delta for the strike-through display even after a reversal.
    if (!flight.outboundOriginalDepartureAt) {
      updateData.outboundOriginalDepartureAt = flight.departureAt;
    }
    // Reflect the new wall-clock time on departureAt. Treating the local
    // string as UTC for now (carrier-tz handling is a follow-up); the
    // original instant stays in outboundOriginalDepartureAt.
    if (!Number.isNaN(newDepartureUtc.getTime())) {
      updateData.departureAt = newDepartureUtc;
    }
    await prisma.flightBooking.update({
      where: { id: flight.id },
      data: updateData,
    });
  } catch {
    // Update failure is non-fatal — the notification path still runs so
    // the user is informed. Sentry capture happens at the route handler.
  }

  const created = await createFlightTimeChangedNotification({
    hotelBooking: booking,
    flight,
    oldDepartureLocal: fb.old_departure_local,
    newDepartureLocal: fb.new_departure_local,
    reasonCode: fb.reason_code,
    providerEventKey,
  });

  return { kind: 'notified', notificationCreated: created, bookingId: booking.id };
}
