import type { InsuranceTier } from '@koncie/types';
import { IATA_TO_CITY } from './iata';

export interface OfferFlightInput {
  destination: string;
  departureAt: Date;
}

export interface OfferUpsellInput {
  status: 'ACTIVE' | 'INACTIVE';
}

/** Sprint 4 — quote slice passed into the resolver. The hub page maps from Prisma rows. */
export interface OfferInsuranceQuoteInput {
  id: string;
  tier: InsuranceTier;
  premiumMinor: number;
  currency: string;
  coverageSummary: string;
}

export type ContextualOffer =
  | { type: 'activities-deep-link'; href: string; title: string; subtitle: string }
  | {
      type: 'insurance-offer';
      destinationLabel: string;
      departureDateLabel: string;
      quotes: OfferInsuranceQuoteInput[];
      /** Quote id pre-selected in the UI. Sprint 4 default: Comprehensive. */
      defaultQuoteId: string;
    };

export interface ResolveInput {
  flight: OfferFlightInput | null;
  upsells: OfferUpsellInput[];
  insuranceQuotes: OfferInsuranceQuoteInput[];
}

const FIJI_AIRPORTS = new Set(['NAN', 'SUV']);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a Date as "14 Jul" in the origin's local zone. Hardcoded to
 * Australia/Sydney for the pilot (all inbound flights originate AU).
 * When a second origin zone arrives, thread the origin IATA through and
 * look up the timezone per-airport.
 */
function formatDayMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(d);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  const monthNum = Number(parts.find((p) => p.type === 'month')!.value);
  return `${day} ${MONTHS[monthNum - 1]}`;
}

export function resolveContextualOffers({
  flight,
  upsells,
  insuranceQuotes,
}: ResolveInput): ContextualOffer[] {
  if (!flight) return [];

  const offers: ContextualOffer[] = [];

  // activities-deep-link: Fiji destination AND ACTIVE upsell exists
  if (FIJI_AIRPORTS.has(flight.destination) && upsells.some((u) => u.status === 'ACTIVE')) {
    offers.push({
      type: 'activities-deep-link',
      href: '/hub/activities',
      title: 'Your Namotu activities await',
      subtitle: 'Ready for when you land in Nadi',
    });
  }

  // insurance-offer: real CoverMore-shaped quotes, Comprehensive pre-selected.
  const defaultQuote =
    insuranceQuotes.find((q) => q.tier === 'comprehensive') ?? insuranceQuotes[0];
  if (defaultQuote) {
    offers.push({
      type: 'insurance-offer',
      destinationLabel: IATA_TO_CITY[flight.destination] ?? flight.destination,
      departureDateLabel: formatDayMonth(flight.departureAt),
      quotes: insuranceQuotes,
      defaultQuoteId: defaultQuote.id,
    });
  }

  return offers;
}
