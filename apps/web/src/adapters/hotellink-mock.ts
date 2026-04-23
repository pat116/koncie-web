import type {
  PartnerAdapter,
  ExternalBooking,
  WebhookResult,
} from '@koncie/types';
import { prisma } from '@/lib/db/prisma';

/**
 * Mock HotelLink adapter — reads from our own DB and reshapes into the
 * `ExternalBooking` wire format that a real HotelLink HTTP call would return.
 *
 * Replaced by a real HTTP adapter in Sprint 7. `PartnerAdapter` is stable;
 * the app never imports this class directly, only the port.
 */
export class HotelLinkMockAdapter implements PartnerAdapter {
  async listBookings(propertySlug: string): Promise<ExternalBooking[]> {
    const bookings = await prisma.booking.findMany({
      where: { property: { slug: propertySlug } },
      include: { guest: true, property: true },
    });
    return bookings.map(toExternal);
  }

  async getBooking(externalRef: string): Promise<ExternalBooking | null> {
    const booking = await prisma.booking.findUnique({
      where: { externalRef },
      include: { guest: true, property: true },
    });
    return booking ? toExternal(booking) : null;
  }

  async onWebhook(): Promise<WebhookResult> {
    // Sprint 7 replaces this with real payload parsing + HMAC verification.
    return {
      accepted: false,
      reason: 'mock adapter does not accept webhooks',
    };
  }
}

type BookingWithRelations = {
  externalRef: string;
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  guest: { email: string; firstName: string; lastName: string };
  property: { slug: string };
};

function toExternal(b: BookingWithRelations): ExternalBooking {
  return {
    externalRef: b.externalRef,
    propertySlug: b.property.slug,
    guest: {
      email: b.guest.email,
      firstName: b.guest.firstName,
      lastName: b.guest.lastName,
    },
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    numGuests: b.numGuests,
    status: b.status,
  };
}
