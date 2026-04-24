import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { flightItinerarySource } from './provider';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

/**
 * Syncs a guest's flight itinerary from the FlightItinerarySource into
 * Koncie's FlightBooking table.
 *
 * - Upserts by (guestId, externalRef) so repeated calls are idempotent.
 * - Deletes stale rows whose externalRef isn't in the latest result set
 *   (handles future flight cancellations).
 * - Updates Guest.flightsLastSyncedAt ONLY on success — if the adapter
 *   throws, the timestamp is left unchanged so the next call retries.
 * - Wraps all DB writes in a $transaction for atomicity.
 */
export async function syncFlightsForGuest(guestId: string): Promise<void> {
  const guest = await prisma.guest.findUniqueOrThrow({ where: { id: guestId } });

  let incoming;
  try {
    incoming = await flightItinerarySource.fetchBookingsForGuest(guest.email);
  } catch (err) {
    Sentry.captureException(err, { tags: { guestId, provider: 'jetseeker' } });
    if (err instanceof JetSeekerUnavailableError) throw err;
    throw new JetSeekerUnavailableError('Unexpected adapter failure', err);
  }

  await prisma.$transaction(async (tx) => {
    for (const b of incoming) {
      await tx.flightBooking.upsert({
        where: {
          guestId_externalRef: { guestId, externalRef: b.externalRef },
        },
        create: {
          guestId,
          externalRef: b.externalRef,
          origin: b.origin,
          destination: b.destination,
          departureAt: new Date(b.departureAt),
          returnAt: b.returnAt ? new Date(b.returnAt) : null,
          carrier: b.carrier,
          metadata: b.metadata as object,
        },
        update: {
          origin: b.origin,
          destination: b.destination,
          departureAt: new Date(b.departureAt),
          returnAt: b.returnAt ? new Date(b.returnAt) : null,
          carrier: b.carrier,
          metadata: b.metadata as object,
        },
      });
    }

    // Delete rows the adapter no longer returns (cancellation handling)
    const keepRefs = incoming.map((b) => b.externalRef);
    await tx.flightBooking.deleteMany({
      where: {
        guestId,
        ...(keepRefs.length > 0 ? { externalRef: { notIn: keepRefs } } : {}),
      },
    });

    await tx.guest.update({
      where: { id: guestId },
      data: { flightsLastSyncedAt: new Date() },
    });
  });
}
