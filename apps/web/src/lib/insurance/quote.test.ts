/* eslint-disable @typescript-eslint/no-explicit-any */
// Mocking Prisma's generated types loose — matches Sprint 3 sync.test.ts policy.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/insurance/provider', () => ({ insuranceQuoteSource: {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { syncInsuranceQuotesForGuest, buildQuoteInput } from './quote';
import { prisma } from '@/lib/db/prisma';
import { insuranceQuoteSource } from './provider';
import { CoverMoreUnavailableError } from '@/lib/errors/insurance';

const seedFlight = {
  id: 'f1',
  destination: 'NAN',
  departureAt: new Date('2026-07-14T08:00:00+10:00'),
  returnAt: new Date('2026-07-21T14:30:00+12:00'),
  metadata: { adults: 2 },
};

function wireCommonPrismaMocks() {
  (prisma as any).guest = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 'g1',
      email: 'pat@kovena.com',
      insuranceLastSyncedAt: null,
    }),
    update: vi.fn().mockResolvedValue({}),
  };
  (prisma as any).flightBooking = {
    findFirst: vi.fn().mockResolvedValue(seedFlight),
  };
  (prisma as any).insuranceQuote = {
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  (prisma as any).$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prisma));
}

describe('syncInsuranceQuotesForGuest happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts three quotes and updates Guest.insuranceLastSyncedAt on success', async () => {
    wireCommonPrismaMocks();
    (insuranceQuoteSource as any).fetchQuotes = vi.fn().mockResolvedValue([
      {
        providerRef: 'CM-ESSENTIALS-PAT-202607142026072',
        tier: 'essentials',
        premiumMinor: 8_900,
        currency: 'AUD',
        coverageSummary: 'Essentials',
        expiresAt: '2026-07-14T08:00:00+10:00',
      },
      {
        providerRef: 'CM-COMPREHENSIVE-PAT-202607142026072',
        tier: 'comprehensive',
        premiumMinor: 14_900,
        currency: 'AUD',
        coverageSummary: 'Comprehensive',
        expiresAt: '2026-07-14T08:00:00+10:00',
      },
      {
        providerRef: 'CM-COMPREHENSIVE_PLUS-PAT-202607142026072',
        tier: 'comprehensive_plus',
        premiumMinor: 21_900,
        currency: 'AUD',
        coverageSummary: 'Comprehensive+',
        expiresAt: '2026-07-14T08:00:00+10:00',
      },
    ]);

    await syncInsuranceQuotesForGuest('g1');

    expect((prisma as any).insuranceQuote.upsert).toHaveBeenCalledTimes(3);
    expect((prisma as any).guest.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { insuranceLastSyncedAt: expect.any(Date) },
    });
  });
});

describe('syncInsuranceQuotesForGuest no-op path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a no-op if the guest has no flight booking', async () => {
    wireCommonPrismaMocks();
    (prisma as any).flightBooking.findFirst = vi.fn().mockResolvedValue(null);
    (insuranceQuoteSource as any).fetchQuotes = vi.fn();

    await syncInsuranceQuotesForGuest('g1');

    expect((insuranceQuoteSource as any).fetchQuotes).not.toHaveBeenCalled();
    expect((prisma as any).insuranceQuote.upsert).not.toHaveBeenCalled();
    expect((prisma as any).guest.update).not.toHaveBeenCalled();
  });
});

describe('syncInsuranceQuotesForGuest failure path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-throws CoverMoreUnavailableError and does NOT update insuranceLastSyncedAt', async () => {
    wireCommonPrismaMocks();
    (insuranceQuoteSource as any).fetchQuotes = vi
      .fn()
      .mockRejectedValue(new CoverMoreUnavailableError('mock outage'));

    await expect(syncInsuranceQuotesForGuest('g1')).rejects.toThrow(CoverMoreUnavailableError);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).guest.update).not.toHaveBeenCalled();
  });
});

describe('buildQuoteInput', () => {
  it('derives travellers array from metadata.adults', () => {
    const input = buildQuoteInput('pat@kovena.com', seedFlight);
    expect(input.travellers).toHaveLength(2);
    expect(input.travellers.every((t) => typeof t.age === 'number')).toBe(true);
  });

  it('defaults to single traveller when metadata lacks adults', () => {
    const input = buildQuoteInput('pat@kovena.com', { ...seedFlight, metadata: {} });
    expect(input.travellers).toHaveLength(1);
  });

  it('maps NAN destination to FJ country code', () => {
    const input = buildQuoteInput('pat@kovena.com', seedFlight);
    expect(input.destinationCountry).toBe('FJ');
    expect(input.destinationIATA).toBe('NAN');
  });

  it('emits ISO-8601 date strings for startDate / endDate', () => {
    const input = buildQuoteInput('pat@kovena.com', seedFlight);
    expect(input.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
