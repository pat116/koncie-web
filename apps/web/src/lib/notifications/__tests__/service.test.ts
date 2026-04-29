/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  createBookingConfirmedNotification,
  createFlightTimeChangedNotification,
  createWelcomeToResortNotification,
  listNotificationsForBooking,
  markNotificationRead,
  markAllReadForBooking,
} from '../service';
import { prisma } from '@/lib/db/prisma';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma as any).notification = {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'n1' }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
  };
});

describe('createBookingConfirmedNotification', () => {
  it('creates exactly one BOOKING_CONFIRMED row for a booking', async () => {
    const created = await createBookingConfirmedNotification({
      bookingId: 'b1',
      propertyName: 'Namotu',
      checkIn: new Date('2030-07-15'),
      checkOut: new Date('2030-07-20'),
    });
    expect(created).toBe(true);
    const data = (prisma as any).notification.create.mock.calls[0][0].data;
    expect(data.kind).toBe('BOOKING_CONFIRMED');
    expect(data.bookingId).toBe('b1');
    expect(data.body).toContain('Namotu');
  });

  it('is idempotent — second call with an existing row returns false and does not write', async () => {
    (prisma as any).notification.findFirst.mockResolvedValue({ id: 'existing' });
    const created = await createBookingConfirmedNotification({
      bookingId: 'b1',
      propertyName: 'Namotu',
      checkIn: new Date(),
      checkOut: new Date(),
    });
    expect(created).toBe(false);
    expect((prisma as any).notification.create).not.toHaveBeenCalled();
  });
});

describe('createFlightTimeChangedNotification', () => {
  it('writes exactly one row keyed on providerEventKey', async () => {
    const created = await createFlightTimeChangedNotification({
      hotelBooking: { id: 'b1' } as any,
      flight: {
        id: 'f1',
        guestId: 'g1',
        externalRef: 'NAMOTU-FJ-001',
        carrier: 'FJ',
      } as any,
      oldDepartureLocal: '2026-07-15T08:00:00',
      newDepartureLocal: '2026-07-15T11:30:00',
      providerEventKey: 'evt-1',
      reasonCode: 'schedule_change',
    });
    expect(created).toBe(true);
    const data = (prisma as any).notification.create.mock.calls[0][0].data;
    expect(data.kind).toBe('FLIGHT_TIME_CHANGED');
    expect(data.metadata).toEqual({
      providerEventKey: 'evt-1',
      reasonCode: 'schedule_change',
    });
  });

  it('dedupes via metadata.providerEventKey', async () => {
    (prisma as any).notification.findFirst.mockResolvedValue({ id: 'existing' });
    const created = await createFlightTimeChangedNotification({
      hotelBooking: { id: 'b1' } as any,
      flight: { id: 'f1', externalRef: 'X', carrier: 'FJ' } as any,
      oldDepartureLocal: '2026-07-15T08:00:00',
      newDepartureLocal: '2026-07-15T11:30:00',
      providerEventKey: 'evt-1',
    });
    expect(created).toBe(false);
  });
});

describe('createWelcomeToResortNotification', () => {
  it('creates a row gated on existing-row-of-kind', async () => {
    const created = await createWelcomeToResortNotification({
      hotelBooking: {
        id: 'b1',
        guest: { firstName: 'Pat' },
        property: { name: 'Namotu' },
      } as any,
    });
    expect(created).toBe(true);
    const data = (prisma as any).notification.create.mock.calls[0][0].data;
    expect(data.kind).toBe('WELCOME_TO_RESORT');
    expect(data.title).toContain('Namotu');
    expect(data.body).toContain('Pat');
  });
});

describe('listNotificationsForBooking', () => {
  it('orders by createdAt DESC and limits to 20 by default', async () => {
    await listNotificationsForBooking('b1');
    const args = (prisma as any).notification.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ bookingId: 'b1' });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.take).toBe(20);
  });
});

describe('markNotificationRead', () => {
  it('sets read=true and stamps readAt', async () => {
    await markNotificationRead('n1');
    const args = (prisma as any).notification.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'n1' });
    expect(args.data.read).toBe(true);
    expect(args.data.readAt).toBeInstanceOf(Date);
  });
});

describe('markAllReadForBooking', () => {
  it('returns the count from updateMany', async () => {
    const n = await markAllReadForBooking('b1');
    expect(n).toBe(2);
  });
});
