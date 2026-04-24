/**
 * InsuranceQuoteSource port. Sprint 4 has one adapter (CoverMoreMockAdapter);
 * a later sprint swaps in a real CoverMore SDK wrapper. Koncie acts as
 * Merchant of Record on the resulting premium charge (MCC 4722) — the provider
 * receives the underwriting payout and Koncie retains the commission.
 *
 * See docs/insurance.md for the port contract and swap-in guide.
 */

export type InsuranceTier = 'essentials' | 'comprehensive' | 'comprehensive_plus';

/** Request shape handed to the provider. Derived from the guest's trip context. */
export interface InsuranceQuoteInput {
  guestEmail: string;
  /** ISO-3166 alpha-2 country code of primary destination (e.g. "FJ") */
  destinationCountry: string;
  /** IATA airport code of primary destination; null if unknown */
  destinationIATA: string | null;
  /** ISO-8601 date (YYYY-MM-DD) — trip start */
  startDate: string;
  /** ISO-8601 date (YYYY-MM-DD) — trip end */
  endDate: string;
  /** Approximate total trip cost in minor units (AUD cents) — used for coverage sizing */
  tripCostMinor: number;
  /** ISO-4217 currency of trip cost (pilot: "AUD") */
  currency: string;
  /** One entry per insured traveller */
  travellers: Array<{ age: number }>;
}

/** Quote returned by the provider. Always three tiers per request in Sprint 4. */
export interface InsuranceQuoteRead {
  /** Provider-side unique quote ID (CoverMore calls these "quote refs") */
  providerRef: string;
  tier: InsuranceTier;
  /** Total premium in minor units, same currency as the request */
  premiumMinor: number;
  currency: string;
  /** Human-readable one-liner: what this tier covers */
  coverageSummary: string;
  /** ISO-8601 with timezone — quote must be purchased before this time */
  expiresAt: string;
}

export interface InsuranceQuoteSource {
  fetchQuotes(input: InsuranceQuoteInput): Promise<InsuranceQuoteRead[]>;
}
