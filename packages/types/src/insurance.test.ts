import { describe, it, expectTypeOf } from 'vitest';
import type { InsuranceQuoteInput, InsuranceQuoteRead, InsuranceQuoteSource, InsuranceTier } from './insurance';

describe('insurance types', () => {
  it('InsuranceQuoteSource has exactly one method', () => {
    type Methods = keyof InsuranceQuoteSource;
    expectTypeOf<Methods>().toEqualTypeOf<'fetchQuotes'>();
  });

  it('InsuranceTier is the approved three-tier union', () => {
    expectTypeOf<InsuranceTier>().toEqualTypeOf<
      'essentials' | 'comprehensive' | 'comprehensive_plus'
    >();
  });

  it('InsuranceQuoteRead carries the expected shape', () => {
    const q: InsuranceQuoteRead = {
      providerRef: 'CM-ESSENTIALS-ABC',
      tier: 'essentials',
      premiumMinor: 8_900,
      currency: 'AUD',
      coverageSummary: 'Emergency medical + cancellation',
      expiresAt: '2026-07-14T08:00:00+10:00',
    };
    expectTypeOf(q.premiumMinor).toEqualTypeOf<number>();
    expectTypeOf(q.tier).toEqualTypeOf<InsuranceTier>();
  });

  it('InsuranceQuoteInput requires travellers array', () => {
    const input: InsuranceQuoteInput = {
      guestEmail: 'a@b.com',
      destinationCountry: 'FJ',
      destinationIATA: 'NAN',
      startDate: '2026-07-14',
      endDate: '2026-07-21',
      tripCostMinor: 300_000,
      currency: 'AUD',
      travellers: [{ age: 35 }],
    };
    expectTypeOf(input.travellers).toEqualTypeOf<Array<{ age: number }>>();
  });
});
