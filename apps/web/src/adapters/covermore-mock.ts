import type {
  InsuranceQuoteInput,
  InsuranceQuoteRead,
  InsuranceQuoteSource,
  InsuranceTier,
} from '@koncie/types';
import { CoverMoreUnavailableError } from '@/lib/errors/insurance';

const NETWORK_DELAY_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fail-trigger email — used in tests to exercise the Sentry wire-up. */
const FAIL_TRIGGER_EMAIL = 'covermore-unavailable@test.com';

/** Sprint 4 pricing: deterministic AUD premiums for any input. See approved spec. */
const TIER_PRICING_AUD_MINOR: Record<InsuranceTier, number> = {
  essentials: 8_900, // AU$89.00
  comprehensive: 14_900, // AU$149.00
  comprehensive_plus: 21_900, // AU$219.00
};

const TIER_COVERAGE: Record<InsuranceTier, string> = {
  essentials: 'Emergency medical + cancellation up to AU$5,000',
  comprehensive: 'Medical, cancellation, baggage, rental excess up to AU$25,000',
  comprehensive_plus: 'Everything in Comprehensive + adventure sports + cruise cover',
};

/** Quotes expire 10 minutes after issue in the mock — matches CoverMore sandbox default. */
const QUOTE_TTL_MS = 10 * 60 * 1000;

/**
 * Deterministic CoverMore-shaped mock adapter. Always returns three tier
 * quotes for any valid input; throws CoverMoreUnavailableError when the
 * fail-trigger email is used.
 *
 * Sprint 4: premium is hardcoded per tier regardless of trip params. When
 * the real CoverMore SDK lands, premium will be a function of trip cost,
 * duration, traveller age(s), and destination risk class.
 */
export class CoverMoreMockAdapter implements InsuranceQuoteSource {
  async fetchQuotes(input: InsuranceQuoteInput): Promise<InsuranceQuoteRead[]> {
    await sleep(NETWORK_DELAY_MS);

    if (input.guestEmail === FAIL_TRIGGER_EMAIL) {
      throw new CoverMoreUnavailableError(
        'CoverMore sandbox simulated outage (mock fail-trigger email)',
      );
    }

    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + QUOTE_TTL_MS).toISOString();

    // Deterministic providerRef suffix so repeated syncs upsert the same rows
    // rather than duplicate. Seeds off guest email + trip dates.
    const refSuffix = this.refSuffix(input);

    const tiers: InsuranceTier[] = ['essentials', 'comprehensive', 'comprehensive_plus'];

    return tiers.map<InsuranceQuoteRead>((tier) => ({
      providerRef: `CM-${tier.toUpperCase()}-${refSuffix}`,
      tier,
      premiumMinor: TIER_PRICING_AUD_MINOR[tier],
      currency: 'AUD',
      coverageSummary: TIER_COVERAGE[tier],
      expiresAt,
    }));
  }

  private refSuffix(input: InsuranceQuoteInput): string {
    const emailKey = input.guestEmail.split('@')[0]?.toUpperCase() ?? 'UNKNOWN';
    const dateKey = `${input.startDate}-${input.endDate}`.replace(/-/g, '');
    return `${emailKey}-${dateKey}`;
  }
}
