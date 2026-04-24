import { describe, it, expect } from 'vitest';
import {
  resolveContextualOffers,
  type OfferInsuranceQuoteInput,
} from './contextual-offers';

const flight = {
  destination: 'NAN',
  departureAt: new Date('2026-07-14T08:00:00+10:00'),
};

const activeUpsell = { status: 'ACTIVE' as const };
const inactiveUpsell = { status: 'INACTIVE' as const };

const threeTierQuotes: OfferInsuranceQuoteInput[] = [
  {
    id: 'q-ess',
    tier: 'essentials',
    premiumMinor: 8_900,
    currency: 'AUD',
    coverageSummary: 'Essentials',
  },
  {
    id: 'q-comp',
    tier: 'comprehensive',
    premiumMinor: 14_900,
    currency: 'AUD',
    coverageSummary: 'Comprehensive',
  },
  {
    id: 'q-plus',
    tier: 'comprehensive_plus',
    premiumMinor: 21_900,
    currency: 'AUD',
    coverageSummary: 'Comprehensive+',
  },
];

describe('resolveContextualOffers', () => {
  it('emits activities-deep-link when destination is NAN AND an ACTIVE Namotu upsell exists', () => {
    const offers = resolveContextualOffers({
      flight,
      upsells: [activeUpsell],
      insuranceQuotes: [],
    });
    const deepLink = offers.find((o) => o.type === 'activities-deep-link');
    expect(deepLink).toBeTruthy();
    if (deepLink?.type !== 'activities-deep-link') throw new Error('unexpected type');
    expect(deepLink.href).toBe('/hub/activities');
  });

  it('does NOT emit activities-deep-link when destination is outside [NAN, SUV]', () => {
    const offers = resolveContextualOffers({
      flight: { ...flight, destination: 'BNE' },
      upsells: [activeUpsell],
      insuranceQuotes: [],
    });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('does NOT emit activities-deep-link when upsells are all INACTIVE', () => {
    const offers = resolveContextualOffers({
      flight,
      upsells: [inactiveUpsell],
      insuranceQuotes: [],
    });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('emits insurance-offer when flight exists AND quotes are present', () => {
    const offers = resolveContextualOffers({
      flight,
      upsells: [],
      insuranceQuotes: threeTierQuotes,
    });
    const offer = offers.find((o) => o.type === 'insurance-offer');
    expect(offer).toBeTruthy();
    if (offer?.type !== 'insurance-offer') throw new Error('unexpected type');
    expect(offer.destinationLabel).toBe('Nadi');
    expect(offer.departureDateLabel).toBe('14 Jul');
    expect(offer.quotes).toHaveLength(3);
  });

  it('pre-selects the Comprehensive tier in the default quote id', () => {
    const offers = resolveContextualOffers({
      flight,
      upsells: [],
      insuranceQuotes: threeTierQuotes,
    });
    const offer = offers.find((o) => o.type === 'insurance-offer');
    if (offer?.type !== 'insurance-offer') throw new Error('unexpected type');
    expect(offer.defaultQuoteId).toBe('q-comp');
  });

  it('does NOT emit insurance-offer when no quotes are provided', () => {
    const offers = resolveContextualOffers({
      flight,
      upsells: [],
      insuranceQuotes: [],
    });
    expect(offers.find((o) => o.type === 'insurance-offer')).toBeUndefined();
  });

  it('emits no offers when flight is null (even with quotes)', () => {
    const offers = resolveContextualOffers({
      flight: null,
      upsells: [activeUpsell],
      insuranceQuotes: threeTierQuotes,
    });
    expect(offers).toEqual([]);
  });
});
