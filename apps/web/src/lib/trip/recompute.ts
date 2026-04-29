/**
 * Sprint 7 — Trip phase + completion recompute (S7-10).
 *
 * Reads Trip + HotelBooking + Property + Cart, computes phase +
 * completionPercent, writes back if (and only if) values changed.
 *
 * Idempotent: re-running with no underlying state change is a read-only
 * operation. The materialised values exist so /trip-itinerary/{slug} can
 * render fast; the recompute keeps them honest.
 */

import { prisma } from '@/lib/db/prisma';
import { derivePhase } from './phase';
import { computeCompletionPercent } from './completion';

export interface RecomputeOptions {
  now?: Date;
}

export interface RecomputeResult {
  tripId: string;
  changed: boolean;
  phase: string;
  completionPercent: number;
}

/**
 * Recompute a single Trip. Caller is responsible for batching at scale.
 * Returns `{ changed: false }` when no DB write was needed.
 */
export async function recomputeTrip(
  tripId: string,
  options: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      hotelBooking: { include: { property: true } },
      cart: { include: { items: true } },
    },
  });
  if (!trip) {
    throw new Error(`recomputeTrip: trip ${tripId} not found`);
  }

  const phase = derivePhase({
    hotelBookingStatus: trip.hotelBooking.status,
    checkIn: trip.hotelBooking.checkIn,
    checkOut: trip.hotelBooking.checkOut,
    propertyTimezone: trip.hotelBooking.property.timezone,
    now: options.now,
  });

  const completionPercent = computeCompletionPercent({
    trip: {
      flightBookingId: trip.flightBookingId,
      preparationStatus: trip.preparationStatus,
    },
    cart: trip.cart
      ? { items: trip.cart.items.map((i: { kind: string }) => ({ kind: i.kind })) }
      : null,
  });

  const changed =
    trip.phase !== phase || trip.completionPercent !== completionPercent;

  if (changed) {
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        phase,
        phaseComputedAt: options.now ?? new Date(),
        completionPercent,
      },
    });
  }

  return { tripId, changed, phase, completionPercent };
}
