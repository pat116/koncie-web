/**
 * Notification seeders for the Sprint-6 checkpoint test (DoD §4.6 — bell
 * dropdown shows three notifications: BOOKING_CONFIRMED read,
 * FLIGHT_TIME_CHANGED unread, WELCOME_TO_RESORT unread; unread counter pill
 * shows 2).
 *
 * Idempotent. Keyed on (bookingId, kind) — re-running against the same
 * seed booking is a no-op for already-seeded kinds.
 */

import { prisma } from '@/lib/db/prisma';

export async function seedNotificationsForBooking(bookingId: string): Promise<{
  created: number;
}> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true, guest: true },
  });
  if (!booking) return { created: 0 };

  const existing = await prisma.notification.findMany({
    where: { bookingId },
    select: { kind: true },
  });
  const have = new Set(existing.map((e) => e.kind));

  const writes: Array<Parameters<typeof prisma.notification.create>[0]> = [];

  if (!have.has('BOOKING_CONFIRMED')) {
    writes.push({
      data: {
        bookingId,
        kind: 'BOOKING_CONFIRMED',
        title: 'Your trip is confirmed',
        body: `Booking confirmed for ${booking.property.name}.`,
        inlineCta: { label: 'View itinerary', href: '/hub' } as object,
        read: true, // Per DoD §4.6 — booking-confirmed lands as read.
        readAt: new Date(),
      },
    });
  }
  if (!have.has('FLIGHT_TIME_CHANGED')) {
    writes.push({
      data: {
        bookingId,
        kind: 'FLIGHT_TIME_CHANGED',
        title: 'Flight time changed',
        body: 'Your outbound flight has shifted by 3h 30m. Tap to review the new times.',
        inlineCta: { label: 'View itinerary', href: '/hub' } as object,
        read: false,
        metadata: { providerEventKey: 'seed:demo-time-change' } as object,
      },
    });
  }
  if (!have.has('WELCOME_TO_RESORT')) {
    writes.push({
      data: {
        bookingId,
        kind: 'WELCOME_TO_RESORT',
        title: `Welcome to ${booking.property.name}`,
        body: `${booking.guest.firstName}, the team can't wait to see you. Your concierge is ready when you are.`,
        read: false,
      },
    });
  }

  for (const w of writes) {
    await prisma.notification.create(w);
  }
  return { created: writes.length };
}
