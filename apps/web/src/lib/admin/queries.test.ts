/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose any-typed Prisma mocks — matches Sprint 3/4 policy.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  listGuestsForProperty,
  listBookingsForProperty,
  listPriorityAlerts,
  computeRevenueKpis,
  listUpsellTransactionsForCsv,
} from './queries';
import { prisma } from '@/lib/db/prisma';

const PROPERTY_ID = 'prop-namotu';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma as any).guest = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  (prisma as any).booking = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  (prisma as any).flightBooking = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  (prisma as any).transaction = {
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }),
  };
  (prisma as any).insurancePolicy = {
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }),
    count: vi.fn().mockResolvedValue(0),
  };
  (prisma as any).insuranceQuote = {
    findMany: vi.fn().mockResolvedValue([]),
  };
});

describe('listGuestsForProperty', () => {
  it('scopes the bookings filter by propertyId', async () => {
    (prisma as any).guest.findMany.mockResolvedValue([]);
    await listGuestsForProperty(PROPERTY_ID);
    const call = (prisma as any).guest.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      bookings: { some: { propertyId: PROPERTY_ID } },
    });
  });

  it('returns booking count + nextCheckIn + claimed status', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    (prisma as any).guest.findMany.mockResolvedValue([
      {
        id: 'g1',
        email: 'jane@demo.com',
        firstName: 'Jane',
        lastName: 'Demo',
        claimedAt: new Date(),
        updatedAt: new Date(),
        bookings: [
          { checkIn: future, propertyId: PROPERTY_ID },
          { checkIn: future, propertyId: PROPERTY_ID },
        ],
        transactions: [{ createdAt: new Date() }],
      },
    ]);
    const rows = await listGuestsForProperty(PROPERTY_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bookingCount).toBe(2);
    expect(rows[0]!.nextCheckIn).toEqual(future);
    expect(rows[0]!.claimed).toBe(true);
  });
});

describe('listBookingsForProperty', () => {
  it('tenant-scopes hotel bookings by propertyId and flights by guest-at-property', async () => {
    await listBookingsForProperty(PROPERTY_ID);
    const hotelCall = (prisma as any).booking.findMany.mock.calls[0][0];
    expect(hotelCall.where).toEqual({ propertyId: PROPERTY_ID });
    const flightCall = (prisma as any).flightBooking.findMany.mock.calls[0][0];
    expect(flightCall.where).toEqual({
      guest: { bookings: { some: { propertyId: PROPERTY_ID } } },
    });
  });

  it('merges hotel + flight rows and sorts by most-recent activity', async () => {
    (prisma as any).booking.findMany.mockResolvedValue([
      {
        id: 'b1',
        externalRef: 'HL-1',
        checkIn: new Date('2026-07-14'),
        checkOut: new Date('2026-07-21'),
        numGuests: 2,
        status: 'CONFIRMED',
        guest: { email: 'jane@demo.com' },
        property: { name: 'Namotu Island Fiji' },
      },
    ]);
    (prisma as any).flightBooking.findMany.mockResolvedValue([
      {
        id: 'f1',
        externalRef: 'JS-1',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: new Date('2026-07-13'),
        returnAt: new Date('2026-07-22'),
        carrier: 'FJ',
        guest: { email: 'jane@demo.com' },
      },
    ]);
    const rows = await listBookingsForProperty(PROPERTY_ID);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.kind).toBe('hotel'); // 2026-07-14 is later than 2026-07-13
    expect(rows[1]!.kind).toBe('flight');
  });
});

describe('listPriorityAlerts', () => {
  const now = new Date('2026-07-10T00:00:00Z');

  it('tenant-scopes all four alert sources via the guest/bookings/propertyId relation', async () => {
    await listPriorityAlerts(PROPERTY_ID, now);

    const guestFilter = { bookings: { some: { propertyId: PROPERTY_ID } } };

    const txCall = (prisma as any).transaction.findMany.mock.calls[0][0];
    expect(txCall.where).toMatchObject({ guest: guestFilter });

    const policyCall = (prisma as any).insurancePolicy.findMany.mock.calls[0][0];
    expect(policyCall.where).toMatchObject({ guest: guestFilter });

    const quoteCall = (prisma as any).insuranceQuote.findMany.mock.calls[0][0];
    expect(quoteCall.where).toMatchObject({ guest: guestFilter });

    const unclaimedCall = (prisma as any).guest.findMany.mock.calls[0][0];
    expect(unclaimedCall.where).toMatchObject({
      claimedAt: null,
      bookings: { some: expect.objectContaining({ propertyId: PROPERTY_ID }) },
    });
  });

  it('sorts critical alerts before warnings and marshals messages correctly', async () => {
    (prisma as any).transaction.findMany.mockResolvedValue([
      {
        id: 'tx1',
        createdAt: new Date('2026-07-09'),
        failureReason: 'card_declined',
        guest: { email: 'jane@demo.com' },
      },
    ]);
    (prisma as any).insurancePolicy.findMany.mockResolvedValue([
      {
        id: 'pol1',
        createdAt: new Date('2026-07-08'),
        failureReason: 'issuer_timeout',
        guest: { email: 'jane@demo.com' },
      },
    ]);

    const alerts = await listPriorityAlerts(PROPERTY_ID, now);
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts[0]!.kind).toBe('insurance_policy_failed');
    expect(alerts[0]!.message).toContain('issuer_timeout');
    expect(alerts[1]!.severity).toBe('warning');
    expect(alerts[1]!.kind).toBe('payment_failed');
    expect(alerts[1]!.message).toContain('card_declined');
  });

  it('flags insurance quotes expiring in the next 72h with no policy', async () => {
    (prisma as any).insuranceQuote.findMany.mockResolvedValue([
      {
        id: 'q1',
        tier: 'COMPREHENSIVE',
        expiresAt: new Date('2026-07-11T12:00:00Z'),
        guest: { email: 'jane@demo.com' },
      },
    ]);
    const alerts = await listPriorityAlerts(PROPERTY_ID, now);
    expect(alerts.find((a) => a.kind === 'insurance_quote_expiring')).toBeDefined();
    const quoteCall = (prisma as any).insuranceQuote.findMany.mock.calls[0][0];
    expect(quoteCall.where.policy).toBeNull();
    expect(quoteCall.where.expiresAt).toEqual({
      gt: now,
      lt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
    });
  });
});

describe('computeRevenueKpis', () => {
  it('computes attach rates against confirmed-booking denominator', async () => {
    (prisma as any).transaction.aggregate.mockResolvedValue({
      _sum: { koncieFeeMinor: 5000, amountMinor: 50000 },
      _count: { _all: 3 },
    });
    (prisma as any).insurancePolicy.aggregate.mockResolvedValue({
      _sum: { koncieFeeMinor: 12_000, amountMinor: 40_000 },
      _count: { _all: 2 },
    });
    (prisma as any).guest.count.mockResolvedValue(20);
    (prisma as any).booking.count.mockResolvedValue(10);
    (prisma as any).flightBooking.count.mockResolvedValue(4);
    (prisma as any).insurancePolicy.count.mockResolvedValue(2);

    const kpis = await computeRevenueKpis(PROPERTY_ID);
    expect(kpis.currency).toBe('AUD');
    expect(kpis.upsellCapturedMinor).toBe(5000);
    expect(kpis.insuranceCapturedMinor).toBe(12_000);
    expect(kpis.flightCapturedMinor).toBe(0); // MVP constant — Jet Seeker owns its ledger
    expect(kpis.totalCapturedMinor).toBe(17_000);
    expect(kpis.bookingsConfirmed).toBe(10);
    expect(kpis.guestCount).toBe(20);
    expect(kpis.upsellAttachRate).toBeCloseTo(0.3);
    expect(kpis.insuranceAttachRate).toBeCloseTo(0.2);
    expect(kpis.flightAttachRate).toBeCloseTo(0.4);
  });

  it('avoids divide-by-zero when no bookings confirmed', async () => {
    (prisma as any).transaction.aggregate.mockResolvedValue({
      _sum: {},
      _count: { _all: 0 },
    });
    (prisma as any).insurancePolicy.aggregate.mockResolvedValue({
      _sum: {},
      _count: { _all: 0 },
    });
    (prisma as any).guest.count.mockResolvedValue(0);
    (prisma as any).booking.count.mockResolvedValue(0);
    (prisma as any).flightBooking.count.mockResolvedValue(0);
    (prisma as any).insurancePolicy.count.mockResolvedValue(0);

    const kpis = await computeRevenueKpis(PROPERTY_ID);
    expect(kpis.upsellAttachRate).toBe(0);
    expect(kpis.insuranceAttachRate).toBe(0);
    expect(kpis.flightAttachRate).toBe(0);
    expect(kpis.totalCapturedMinor).toBe(0);
  });

  it('scopes all aggregates to the property via booking.propertyId or guest-at-property', async () => {
    await computeRevenueKpis(PROPERTY_ID);
    const txCall = (prisma as any).transaction.aggregate.mock.calls[0][0];
    expect(txCall.where).toEqual({
      status: 'captured',
      booking: { propertyId: PROPERTY_ID },
    });
    const polCall = (prisma as any).insurancePolicy.aggregate.mock.calls[0][0];
    expect(polCall.where).toEqual({
      status: 'ACTIVE',
      guest: { bookings: { some: { propertyId: PROPERTY_ID } } },
    });
  });
});

describe('listUpsellTransactionsForCsv', () => {
  it('tenant-scopes via booking.propertyId', async () => {
    await listUpsellTransactionsForCsv(PROPERTY_ID);
    const call = (prisma as any).transaction.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ booking: { propertyId: PROPERTY_ID } });
  });
});
