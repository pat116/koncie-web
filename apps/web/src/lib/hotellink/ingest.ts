/**
 * HotelLink booking ingest.
 *
 * Called by the webhook route after HMAC verification, and by the dev
 * `/dev-test/ingest-hotellink-for-seed-guest` helper for local demos.
 *
 * Contract:
 *  1. Zod-validate the payload (ZodError surfaces to the caller so the
 *     webhook can return 400).
 *  2. Resolve the target Property by slug → throw PropertyNotFoundError
 *     if unknown (webhook turns into 404; HotelLink then stops retrying).
 *  3. Upsert Guest + HotelBooking atomically inside a single transaction,
 *     keyed on email and externalRef respectively. Second ingest with
 *     the same bookingRef updates in place (idempotent at the DB layer).
 *  4. For CONFIRMED only: fire the "account ready" magic-link email,
 *     guarded by a 14-day MessageLog look-back so repeat webhooks don't
 *     re-send. CANCELLED / COMPLETED update booking state but don't
 *     send — the enum is ready for Sprint 8+ MODIFY/CANCEL flows.
 *  5. Return the upserted entities plus the messageLogId (or null if we
 *     skipped the send) so the webhook can echo it back in the 200.
 */
import type { HotelBooking, Guest, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { signMagicLink } from '@/lib/auth/signed-link';
import { sendMessage } from '@/lib/messaging/send';
import { createBookingConfirmedNotification } from '@/lib/notifications/service';
import {
  hotelLinkWebhookPayloadSchema,
  type HotelLinkWebhookPayload,
} from '@/adapters/hotellink-mock';

export class PropertyNotFoundError extends Error {
  constructor(readonly slug: string) {
    super(`Property not found for slug "${slug}"`);
    this.name = 'PropertyNotFoundError';
  }
}

export type IngestResult = {
  guest: Guest;
  hotelBooking: HotelBooking;
  messageLogId: string | null;
  skipped: null | 'non_confirmed_status' | 'already_sent';
};

export type IngestOptions = {
  /** Deterministic clock for the 14-day idempotency window in tests. */
  now?: Date;
};

const MESSAGE_LOG_DEDUPE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function ingestHotelLinkBooking(
  rawPayload: unknown,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const payload: HotelLinkWebhookPayload =
    hotelLinkWebhookPayloadSchema.parse(rawPayload);

  const property = await prisma.property.findUnique({
    where: { slug: payload.propertySlug },
    select: { id: true, name: true },
  });
  if (!property) {
    throw new PropertyNotFoundError(payload.propertySlug);
  }

  const checkInDate = new Date(payload.checkIn);
  const checkOutDate = new Date(payload.checkOut);

  const { guest, hotelBooking } = await prisma.$transaction(async (tx) => {
    const g = await tx.guest.upsert({
      where: { email: payload.guest.email },
      create: {
        email: payload.guest.email,
        firstName: payload.guest.firstName,
        lastName: payload.guest.lastName,
      },
      update: {
        firstName: payload.guest.firstName,
        lastName: payload.guest.lastName,
      },
    });

    const bookingData = {
      propertyId: property.id,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      numGuests: payload.numGuests,
      status: payload.status,
    } satisfies Omit<Prisma.HotelBookingUncheckedCreateInput, 'externalRef' | 'guestId'>;

    const b = await tx.hotelBooking.upsert({
      where: { externalRef: payload.bookingRef },
      create: {
        externalRef: payload.bookingRef,
        guestId: g.id,
        ...bookingData,
      },
      update: {
        guestId: g.id,
        ...bookingData,
      },
    });

    return { guest: g, hotelBooking: b };
  });

  if (payload.status !== 'CONFIRMED') {
    return { guest, hotelBooking, messageLogId: null, skipped: 'non_confirmed_status' };
  }

  // BOOKING_CONFIRMED notification (Sprint-6 completion §3.S6-09).
  // Fires once per booking — service-level idempotency. Independent of the
  // email-send dedupe below.
  await createBookingConfirmedNotification({
    bookingId: hotelBooking.id,
    propertyName: property.name,
    checkIn: hotelBooking.checkIn,
    checkOut: hotelBooking.checkOut,
  }).catch(() => {
    // Notification creation failure is logged at the service layer; never
    // block the email flow on it.
  });

  const now = opts.now ?? new Date();
  const existing = await prisma.messageLog.findFirst({
    where: {
      guestId: guest.id,
      bookingId: hotelBooking.id,
      kind: 'HOTEL_BOOKING_CONFIRMED',
      createdAt: { gte: new Date(now.getTime() - MESSAGE_LOG_DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (existing) {
    return { guest, hotelBooking, messageLogId: existing.id, skipped: 'already_sent' };
  }

  const token = await signMagicLink({
    bookingId: hotelBooking.id,
    guestEmail: guest.email,
    expiresInSeconds: MAGIC_LINK_TTL_SECONDS,
  });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const claimLink = `${siteUrl}/welcome?token=${token}`;

  const result = await sendMessage({
    kind: 'HOTEL_BOOKING_CONFIRMED',
    templateId: 'hotel-booking-confirmed-v1',
    to: guest.email,
    guestId: guest.id,
    bookingId: hotelBooking.id,
    vars: {
      firstName: guest.firstName,
      propertyName: property.name,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      claimLink,
    },
  });

  return {
    guest,
    hotelBooking,
    messageLogId: result.messageLog.id,
    skipped: null,
  };
}
