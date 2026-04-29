/**
 * Notifications service (Sprint-6 completion §3.S6-09).
 *
 * Three NotificationKinds, all polled (60s open / 5min idle, driven from
 * the client). The bell-dropdown surface is in S6-10. HotelBooking-confirmed and
 * welcome-to-resort notifications fire from local event handlers /
 * cron; flight-time-changed notifications fire from S6-08's JetSeeker
 * webhook receiver.
 */

import { prisma } from '@/lib/db/prisma';
import type { HotelBooking, FlightBooking, Guest, Property } from '@prisma/client';

export type NotificationInlineCta = {
  label: string;
  href: string;
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Fired by the booking-confirmed event handler (HotelLink ingest path).
 * Idempotent — dedupes on the existence of any prior BOOKING_CONFIRMED
 * notification for the hotelBooking. Returns true if a row was created.
 */
export async function createBookingConfirmedNotification(input: {
  bookingId: string;
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
}): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { bookingId: input.bookingId, kind: 'BOOKING_CONFIRMED' },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.notification.create({
    data: {
      bookingId: input.bookingId,
      kind: 'BOOKING_CONFIRMED',
      title: 'Your trip is confirmed',
      body: `HotelBooking confirmed for ${input.propertyName}, ${fmtDate(input.checkIn)} → ${fmtDate(input.checkOut)}.`,
      inlineCta: { label: 'View itinerary', href: '/hub' } as object,
    },
  });
  return true;
}

/**
 * Fired by the JetSeeker time-change webhook (S6-08). Idempotent on
 * (bookingId, kind, metadata.providerEventKey) where the event key is the
 * `jetseeker_order_id:occurred_at` composite. Returns true if a row was
 * created.
 */
export async function createFlightTimeChangedNotification(input: {
  hotelBooking: HotelBooking;
  flight: FlightBooking;
  oldDepartureLocal: string;
  newDepartureLocal: string;
  reasonCode?: string;
  providerEventKey: string;
}): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      bookingId: input.hotelBooking.id,
      kind: 'FLIGHT_TIME_CHANGED',
      metadata: { path: ['providerEventKey'], equals: input.providerEventKey },
    },
    select: { id: true },
  });
  if (existing) return false;

  const oldDate = new Date(input.oldDepartureLocal);
  const newDate = new Date(input.newDepartureLocal);
  const same = oldDate.toDateString() === newDate.toDateString();

  const body = same
    ? `Your flight ${input.flight.carrier}${input.flight.externalRef} now departs ${fmtTime(newDate)} (was ${fmtTime(oldDate)}) on ${fmtDate(newDate)}.`
    : `Your flight ${input.flight.carrier}${input.flight.externalRef} now departs ${fmtDate(newDate)} ${fmtTime(newDate)} (was ${fmtDate(oldDate)} ${fmtTime(oldDate)}).`;

  await prisma.notification.create({
    data: {
      bookingId: input.hotelBooking.id,
      kind: 'FLIGHT_TIME_CHANGED',
      title: 'Flight time changed',
      body,
      inlineCta: { label: 'View itinerary', href: '/hub' } as object,
      metadata: {
        providerEventKey: input.providerEventKey,
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      } as object,
    },
  });
  return true;
}

/**
 * Fired from the pre-arrival cron at T-0. Idempotent — dedupes on existing
 * row of kind for the hotelBooking.
 */
export async function createWelcomeToResortNotification(input: {
  hotelBooking: HotelBooking & { guest: Guest; property: Property };
}): Promise<boolean> {
  const { hotelBooking } = input;
  const existing = await prisma.notification.findFirst({
    where: { bookingId: hotelBooking.id, kind: 'WELCOME_TO_RESORT' },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.notification.create({
    data: {
      bookingId: hotelBooking.id,
      kind: 'WELCOME_TO_RESORT',
      title: `Welcome to ${hotelBooking.property.name}`,
      body: `${hotelBooking.guest.firstName}, the team can't wait to see you. Your concierge is ready when you are.`,
    },
  });
  return true;
}

export async function listNotificationsForBooking(
  bookingId: string,
  options?: { limit?: number },
) {
  const limit = options?.limit ?? 20;
  return prisma.notification.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await prisma.notification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
}

export async function markAllReadForBooking(bookingId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { bookingId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return result.count;
}
