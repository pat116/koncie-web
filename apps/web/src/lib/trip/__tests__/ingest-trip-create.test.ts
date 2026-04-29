/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/messaging/send', () => ({
  sendMessage: vi.fn().mockResolvedValue({
    messageLog: { id: 'msg-1' },
    delivered: true,
  }),
}));
vi.mock('@/lib/auth/signed-link', () => ({
  signMagicLink: vi.fn().mockResolvedValue('signed-token-abc'),
}));

import { ingestHotelLinkBooking } from '@/lib/hotellink/ingest';
import { prisma } from '@/lib/db/prisma';
import { mockHotelLinkWebhookPayload } from '@/adapters/hotellink-mock';

const PROPERTY = {
  id: 'prop-1',
  name: 'Namotu Island Fiji',
  timezone: 'Pacific/Fiji',
};
const GUEST = {
  id: 'guest-1',
  email: 'pat@kovena.com',
  firstName: 'Jane',
  lastName: 'Demo',
};
const BOOKING_BASE = {
  id: 'booking-1',
  guestId: GUEST.id,
  propertyId: PROPERTY.id,
  externalRef: 'HL-NAMOTU-0001',
  status: 'CONFIRMED',
  checkIn: new Date('2026-08-04T00:00:00Z'),
  checkOut: new Date('2026-08-11T00:00:00Z'),
};

function wirePrismaWithExistingTrip(existingTrip: unknown) {
  (prisma as any).property = { findUnique: vi.fn().mockResolvedValue(PROPERTY) };
  (prisma as any).guest = { upsert: vi.fn().mockResolvedValue(GUEST) };
  (prisma as any).hotelBooking = {
    upsert: vi.fn().mockResolvedValue(BOOKING_BASE),
  };
  (prisma as any).trip = {
    findUnique: vi.fn().mockResolvedValue(existingTrip),
    create: vi.fn().mockResolvedValue({
      id: 'trip-1',
      slug: 'namotu-island-fiji',
    }),
  };
  (prisma as any).cart = {
    findFirst: vi.fn().mockResolvedValue(
      existingTrip ? { id: 'cart-existing', state: 'OPEN' } : null,
    ),
    create: vi.fn().mockResolvedValue({ id: 'cart-1', state: 'OPEN' }),
  };
  (prisma as any).messageLog = {
    findFirst: vi.fn().mockResolvedValue(null),
  };
  (prisma as any).$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prisma));
}

describe('S7-12 — ingestHotelLinkBooking creates Trip + OPEN Cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wirePrismaWithExistingTrip(null);
  });

  it('first ingest creates Trip with slug "namotu-island-fiji"', async () => {
    const payload = mockHotelLinkWebhookPayload();
    const result = await ingestHotelLinkBooking(payload);

    expect((prisma as any).trip.create).toHaveBeenCalledTimes(1);
    const tripArg = (prisma as any).trip.create.mock.calls[0][0];
    expect(tripArg.data.slug).toBe('namotu-island-fiji');
    expect(tripArg.data.guestId).toBe(GUEST.id);
    expect(tripArg.data.hotelBookingId).toBe(BOOKING_BASE.id);
    expect(tripArg.data.startDate).toEqual(BOOKING_BASE.checkIn);
    expect(tripArg.data.endDate).toEqual(BOOKING_BASE.checkOut);
    expect(result.trip).toBeTruthy();
    expect(result.trip?.slug).toBe('namotu-island-fiji');
  });

  it('first ingest creates an OPEN Cart for the new Trip', async () => {
    const payload = mockHotelLinkWebhookPayload();
    const result = await ingestHotelLinkBooking(payload);

    expect((prisma as any).cart.create).toHaveBeenCalledTimes(1);
    const cartArg = (prisma as any).cart.create.mock.calls[0][0];
    expect(cartArg.data.state).toBe('OPEN');
    expect(cartArg.data.tripId).toBe('trip-1');
    expect(result.cart?.state).toBe('OPEN');
  });

  it('Trip preparation_status defaults to the 5 PENDING steps', async () => {
    const payload = mockHotelLinkWebhookPayload();
    await ingestHotelLinkBooking(payload);

    const tripArg = (prisma as any).trip.create.mock.calls[0][0];
    expect(tripArg.data.preparationStatus).toEqual({
      documents: { status: 'PENDING', checkedAt: null },
      health: { status: 'PENDING', checkedAt: null },
      weather: { status: 'PENDING', checkedAt: null },
      currency: { status: 'PENDING', checkedAt: null },
      customs: { status: 'PENDING', checkedAt: null },
    });
  });

  it('infers originAirportIata from AU postcode in guest.address', async () => {
    const payload = mockHotelLinkWebhookPayload({
      guest: {
        address: { country: 'AU', postcode: '2000' }, // Sydney
      } as any,
    });
    await ingestHotelLinkBooking(payload);

    const tripArg = (prisma as any).trip.create.mock.calls[0][0];
    expect(tripArg.data.originAirportIata).toBe('SYD');
  });

  it('payload without address → Trip.originAirportIata = null, no error', async () => {
    const payload = mockHotelLinkWebhookPayload(); // default has no address
    const result = await ingestHotelLinkBooking(payload);

    const tripArg = (prisma as any).trip.create.mock.calls[0][0];
    expect(tripArg.data.originAirportIata).toBeNull();
    expect(result.trip).toBeTruthy();
  });

  it('re-ingest with same bookingRef is a no-op past Booking upsert (no second Trip/Cart, no second email)', async () => {
    wirePrismaWithExistingTrip({
      id: 'trip-1',
      slug: 'namotu-island-fiji',
      hotelBookingId: BOOKING_BASE.id,
    });

    const payload = mockHotelLinkWebhookPayload();
    const result = await ingestHotelLinkBooking(payload);

    expect((prisma as any).trip.create).not.toHaveBeenCalled();
    expect((prisma as any).cart.create).not.toHaveBeenCalled();
    expect(result.trip?.id).toBe('trip-1');
    expect(result.cart?.id).toBe('cart-existing');
  });

  it('passes enrichment fields through to HotelBooking upsert', async () => {
    const payload = mockHotelLinkWebhookPayload({
      room: {
        name: 'Beachfront Bure',
        code: 'BB',
        bedConfig: 'King',
        view: 'Ocean',
        sqm: 45,
        amenities: ['wifi', 'aircon'],
        specialFeatures: ['outdoor-shower'],
      } as any,
      pricing: {
        currency: 'FJD',
        pricePerNightMinor: 80000,
        subtotalMinor: 560000,
        feesTaxesMinor: 56000,
        totalPaidMinor: 616000,
      } as any,
      confirmationNumber: 'NAMO-CONF-12345',
    });
    await ingestHotelLinkBooking(payload);

    const upsertArg = (prisma as any).hotelBooking.upsert.mock.calls[0][0];
    expect(upsertArg.create.roomTypeName).toBe('Beachfront Bure');
    expect(upsertArg.create.amenities).toEqual(['wifi', 'aircon']);
    expect(upsertArg.create.totalPaidMinor).toBe(616000);
    expect(upsertArg.create.currency).toBe('FJD');
    expect(upsertArg.create.confirmationNumber).toBe('NAMO-CONF-12345');
    // raw_payload always contains the inbound shape for diagnostic.
    expect(upsertArg.create.rawPayload).toBeTruthy();
  });

  it('non-CONFIRMED status still creates Trip + Cart but skips email send', async () => {
    const payload = mockHotelLinkWebhookPayload({ status: 'CANCELLED' });
    (prisma as any).hotelBooking.upsert.mockResolvedValue({
      ...BOOKING_BASE,
      status: 'CANCELLED',
    });
    const result = await ingestHotelLinkBooking(payload);

    // Per spec: Trip creation runs in the txn regardless of status; the
    // phase function will resolve to PRE_CONFIRMATION for non-CONFIRMED.
    expect((prisma as any).trip.create).toHaveBeenCalledTimes(1);
    const tripArg = (prisma as any).trip.create.mock.calls[0][0];
    expect(tripArg.data.phase).toBe('PRE_CONFIRMATION');

    expect(result.skipped).toBe('non_confirmed_status');
    expect(result.messageLogId).toBeNull();
  });
});
