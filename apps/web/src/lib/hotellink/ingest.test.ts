/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose `any` on Prisma mocks mirrors the Sprint 3+ convention used across
// apps/web/src/lib/flights/sync.test.ts and hub/checkout/actions.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/messaging/send', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/auth/signed-link', () => ({
  signMagicLink: vi.fn().mockResolvedValue('signed-token-abc'),
}));

import { ingestHotelLinkBooking, PropertyNotFoundError } from './ingest';
import { prisma } from '@/lib/db/prisma';
import { sendMessage } from '@/lib/messaging/send';
import { signMagicLink } from '@/lib/auth/signed-link';
import { mockHotelLinkWebhookPayload } from '@/adapters/hotellink-mock';

const PROPERTY = { id: 'prop-1', name: 'Namotu Island Fiji' };
const GUEST = {
  id: 'guest-1',
  email: 'pat@kovena.com',
  firstName: 'Jane',
  lastName: 'Demo',
};
const BOOKING = {
  id: 'booking-1',
  guestId: GUEST.id,
  propertyId: PROPERTY.id,
  externalRef: 'HL-NAMOTU-0001',
  status: 'CONFIRMED',
};

function wireDefaultPrisma() {
  (prisma as any).property = {
    findUnique: vi.fn().mockResolvedValue(PROPERTY),
  };
  (prisma as any).guest = { upsert: vi.fn().mockResolvedValue(GUEST) };
  (prisma as any).booking = { upsert: vi.fn().mockResolvedValue(BOOKING) };
  (prisma as any).messageLog = {
    findFirst: vi.fn().mockResolvedValue(null),
  };
  (prisma as any).$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prisma));
  (sendMessage as any).mockResolvedValue({
    messageLog: { id: 'msg-1' },
    delivered: true,
  });
}

describe('ingestHotelLinkBooking — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireDefaultPrisma();
  });

  it('upserts Guest + Booking and dispatches the confirmation email', async () => {
    const payload = mockHotelLinkWebhookPayload();
    const result = await ingestHotelLinkBooking(payload);

    expect((prisma as any).guest.upsert).toHaveBeenCalledTimes(1);
    expect((prisma as any).guest.upsert.mock.calls[0][0].where).toEqual({
      email: 'pat@kovena.com',
    });

    expect((prisma as any).booking.upsert).toHaveBeenCalledTimes(1);
    const bookingUpsertArg = (prisma as any).booking.upsert.mock.calls[0][0];
    expect(bookingUpsertArg.where).toEqual({ externalRef: 'HL-NAMOTU-0001' });
    expect(bookingUpsertArg.create.guestId).toBe(GUEST.id);
    expect(bookingUpsertArg.create.propertyId).toBe(PROPERTY.id);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const sendArg = (sendMessage as any).mock.calls[0][0];
    expect(sendArg.kind).toBe('HOTEL_BOOKING_CONFIRMED');
    expect(sendArg.templateId).toBe('hotel-booking-confirmed-v1');
    expect(sendArg.to).toBe('pat@kovena.com');
    expect(sendArg.guestId).toBe(GUEST.id);
    expect(sendArg.bookingId).toBe(BOOKING.id);
    expect(sendArg.vars.propertyName).toBe('Namotu Island Fiji');
    expect(sendArg.vars.claimLink).toContain('/welcome?token=signed-token-abc');

    expect(result.messageLogId).toBe('msg-1');
    expect(result.skipped).toBeNull();
  });

  it('signs the magic link with a 7-day TTL and the booking id', async () => {
    await ingestHotelLinkBooking(mockHotelLinkWebhookPayload());
    expect(signMagicLink).toHaveBeenCalledWith({
      bookingId: BOOKING.id,
      guestEmail: GUEST.email,
      expiresInSeconds: 7 * 24 * 60 * 60,
    });
  });

  it('runs guest + booking writes inside a $transaction', async () => {
    await ingestHotelLinkBooking(mockHotelLinkWebhookPayload());
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
  });

  it('passes fresh firstName / lastName into the Guest upsert.update branch', async () => {
    await ingestHotelLinkBooking(
      mockHotelLinkWebhookPayload({
        guest: { firstName: 'Updated', lastName: 'Name' },
      }),
    );
    const updateArg = (prisma as any).guest.upsert.mock.calls[0][0].update;
    expect(updateArg.firstName).toBe('Updated');
    expect(updateArg.lastName).toBe('Name');
  });
});

describe('ingestHotelLinkBooking — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireDefaultPrisma();
  });

  it('skips sendMessage when a HOTEL_BOOKING_CONFIRMED row already exists in the last 14 days', async () => {
    (prisma as any).messageLog.findFirst.mockResolvedValue({ id: 'existing-msg' });

    const result = await ingestHotelLinkBooking(mockHotelLinkWebhookPayload());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.messageLogId).toBe('existing-msg');
    expect(result.skipped).toBe('already_sent');
  });

  it('queries MessageLog with the (guestId, bookingId, kind, 14-day window) filter', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await ingestHotelLinkBooking(mockHotelLinkWebhookPayload(), { now });
    const where = (prisma as any).messageLog.findFirst.mock.calls[0][0].where;
    expect(where.guestId).toBe(GUEST.id);
    expect(where.bookingId).toBe(BOOKING.id);
    expect(where.kind).toBe('HOTEL_BOOKING_CONFIRMED');
    const expectedCutoff = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    );
    expect((where.createdAt.gte as Date).toISOString()).toBe(
      expectedCutoff.toISOString(),
    );
  });
});

describe('ingestHotelLinkBooking — error + non-confirmed paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireDefaultPrisma();
  });

  it('throws PropertyNotFoundError when the propertySlug is unknown', async () => {
    (prisma as any).property.findUnique.mockResolvedValue(null);
    await expect(
      ingestHotelLinkBooking(mockHotelLinkWebhookPayload()),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  });

  it('surfaces ZodError when the payload is malformed', async () => {
    await expect(
      ingestHotelLinkBooking({
        bookingRef: '',
        propertySlug: 'x',
        guest: { email: 'not-an-email', firstName: 'A', lastName: 'B' },
        checkIn: 'not-a-date',
        checkOut: '2026-08-11T00:00:00.000Z',
        numGuests: 0,
        status: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not send the confirmation email for CANCELLED bookings', async () => {
    (prisma as any).booking.upsert.mockResolvedValue({ ...BOOKING, status: 'CANCELLED' });

    const result = await ingestHotelLinkBooking(
      mockHotelLinkWebhookPayload({ status: 'CANCELLED' }),
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.skipped).toBe('non_confirmed_status');
    expect(result.messageLogId).toBeNull();
  });
});
