import { describe, it, expect } from 'vitest';
import { CoverMoreMockAdapter } from './covermore-mock';
import { CoverMoreUnavailableError } from '@/lib/errors/insurance';

const adapter = new CoverMoreMockAdapter();

const baseInput = {
  guestEmail: 'pat@kovena.com',
  destinationCountry: 'FJ',
  destinationIATA: 'NAN' as string | null,
  startDate: '2026-07-14',
  endDate: '2026-07-21',
  tripCostMinor: 300_000,
  currency: 'AUD',
  travellers: [{ age: 35 }],
};

describe('CoverMoreMockAdapter.fetchQuotes', () => {
  it('returns exactly three tier quotes for any valid input', async () => {
    const quotes = await adapter.fetchQuotes(baseInput);
    expect(quotes).toHaveLength(3);
    const tiers = quotes.map((q) => q.tier).sort();
    expect(tiers).toEqual(['comprehensive', 'comprehensive_plus', 'essentials']);
  });

  it('returns the approved AUD premiums per tier', async () => {
    const quotes = await adapter.fetchQuotes(baseInput);
    const byTier = Object.fromEntries(quotes.map((q) => [q.tier, q.premiumMinor]));
    expect(byTier.essentials).toBe(8_900);
    expect(byTier.comprehensive).toBe(14_900);
    expect(byTier.comprehensive_plus).toBe(21_900);
  });

  it('all quotes use AUD currency in Sprint 4', async () => {
    const quotes = await adapter.fetchQuotes(baseInput);
    for (const q of quotes) expect(q.currency).toBe('AUD');
  });

  it('throws CoverMoreUnavailableError for the fail-trigger email', async () => {
    await expect(
      adapter.fetchQuotes({ ...baseInput, guestEmail: 'covermore-unavailable@test.com' }),
    ).rejects.toThrow(CoverMoreUnavailableError);
  });

  it('providerRef is deterministic across repeated calls for the same input', async () => {
    const first = await adapter.fetchQuotes(baseInput);
    const second = await adapter.fetchQuotes(baseInput);
    expect(first.map((q) => q.providerRef)).toEqual(second.map((q) => q.providerRef));
  });
});
