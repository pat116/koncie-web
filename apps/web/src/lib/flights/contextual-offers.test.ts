import { describe, it, expect } from 'vitest';
import { resolveContextualOffers } from './contextual-offers';

const flight = {
  destination: 'NAN',
  departureAt: new Date('2026-07-14T08:00:00+10:00'),
};

const activeUpsell = { status: 'ACTIVE' as const };
const inactiveUpsell = { status: 'INACTIVE' as const };

describe('resolveContextualOffers', () => {
  it('emits activities-deep-link when destination is NAN AND an ACTIVE Namotu upsell exists', () => {
    const offers = resolveContextualOffers({ flight, upsells: [activeUpsell] });
    const deepLink = offers.find((o) => o.type === 'activities-deep-link');
    expect(deepLink).toBeTruthy();
    expect(deepLink!.href).toBe('/hub/activities');
  });

  it('does NOT emit activities-deep-link when destination is outside [NAN, SUV]', () => {
    const offers = resolveContextualOffers({
      flight: { ...flight, destination: 'BNE' },
      upsells: [activeUpsell],
    });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('does NOT emit activities-deep-link when upsells are all INACTIVE even if destination matches', () => {
    const offers = resolveContextualOffers({ flight, upsells: [inactiveUpsell] });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('emits insurance-stub whenever a flight exists', () => {
    const offers = resolveContextualOffers({ flight, upsells: [] });
    const stub = offers.find((o) => o.type === 'insurance-stub');
    expect(stub).toBeTruthy();
    expect(stub!.destinationLabel).toBe('Nadi');
    expect(stub!.departureDateLabel).toBe('14 Jul');
  });

  it('falls back to raw IATA code when destination is not in IATA_TO_CITY', () => {
    const offers = resolveContextualOffers({
      flight: { ...flight, destination: 'LAX' },
      upsells: [],
    });
    const stub = offers.find((o) => o.type === 'insurance-stub');
    expect(stub!.destinationLabel).toBe('LAX');
  });

  it('emits no offers when flight is null', () => {
    const offers = resolveContextualOffers({ flight: null, upsells: [activeUpsell] });
    expect(offers).toEqual([]);
  });
});
