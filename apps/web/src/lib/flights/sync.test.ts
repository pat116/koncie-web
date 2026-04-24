/* eslint-disable @typescript-eslint/no-explicit-any */
// Mocking Prisma's generated types loose in tests — same policy as
// apps/web/src/app/hub/checkout/actions.test.ts from Sprint 2 polish.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/flights/provider', () => ({ flightItinerarySource: {} }));

import { syncFlightsForGuest } from './sync';
import { prisma } from '@/lib/db/prisma';
import { flightItinerarySource } from './provider';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

describe('syncFlightsForGuest happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates FlightBooking rows from adapter results and updates Guest.flightsLastSyncedAt', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'g1',
        email: 'pat@kovena.com',
        flightsLastSyncedAt: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    };
    (prisma as any).flightBooking = {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    (prisma as any).$transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prisma));

    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-JANE-NAMOTU-01',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: '2026-07-21T14:30:00+12:00',
        carrier: 'FJ',
        metadata: { adults: 2 },
      },
    ]);

    await syncFlightsForGuest('g1');

    expect((prisma as any).flightBooking.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = (prisma as any).flightBooking.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      guestId_externalRef: { guestId: 'g1', externalRef: 'JS-JANE-NAMOTU-01' },
    });
    expect(upsertArg.create.origin).toBe('SYD');
    expect(upsertArg.create.destination).toBe('NAN');

    expect((prisma as any).guest.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { flightsLastSyncedAt: expect.any(Date) },
    });
  });
});

describe('syncFlightsForGuest idempotency + stale cleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('second sync with identical data is idempotent (upsert called, no duplicate create)', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'g1', email: 'pat@kovena.com' }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };
    (prisma as any).$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma));
    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-1',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: null,
        carrier: 'FJ',
        metadata: {},
      },
    ]);

    await syncFlightsForGuest('g1');
    await syncFlightsForGuest('g1');

    // Upsert called twice — once per sync — with the same where clause.
    expect((prisma as any).flightBooking.upsert).toHaveBeenCalledTimes(2);
    const [[firstArg], [secondArg]] = (prisma as any).flightBooking.upsert.mock.calls;
    expect(firstArg.where).toEqual(secondArg.where);
  });

  it('deletes rows whose externalRef is not in the latest result set', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'g1', email: 'pat@kovena.com' }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
    (prisma as any).$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma));
    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-STILL-HERE',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: null,
        carrier: 'FJ',
        metadata: {},
      },
    ]);

    await syncFlightsForGuest('g1');

    expect((prisma as any).flightBooking.deleteMany).toHaveBeenCalledWith({
      where: {
        guestId: 'g1',
        externalRef: { notIn: ['JS-STILL-HERE'] },
      },
    });
  });
});

describe('syncFlightsForGuest failure path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-throws JetSeekerUnavailableError and does NOT update flightsLastSyncedAt', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'g1', email: 'flight-unavailable@test.com', flightsLastSyncedAt: null }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn() };
    (prisma as any).$transaction = vi.fn();
    (flightItinerarySource as any).fetchBookingsForGuest = vi
      .fn()
      .mockRejectedValue(new JetSeekerUnavailableError('mock outage'));

    await expect(syncFlightsForGuest('g1')).rejects.toThrow(JetSeekerUnavailableError);

    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).guest.update).not.toHaveBeenCalled();
  });
});
