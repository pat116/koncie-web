import { describe, it, expect } from 'vitest';
import {
  computeCompletionPercent,
  computePrepCompletion,
  computeCartCompletion,
  computeFlightCompletion,
} from '../completion';

const allPending = {
  documents: { status: 'PENDING' },
  health: { status: 'PENDING' },
  weather: { status: 'PENDING' },
  currency: { status: 'PENDING' },
  customs: { status: 'PENDING' },
};

const allDone = {
  documents: { status: 'COMPLETE' },
  health: { status: 'COMPLETE' },
  weather: { status: 'NA' }, // NA also counts
  currency: { status: 'COMPLETE' },
  customs: { status: 'COMPLETE' },
};

describe('computePrepCompletion', () => {
  it('all PENDING → 0', () => {
    expect(computePrepCompletion(allPending)).toBe(0);
  });
  it('all COMPLETE/NA → 1', () => {
    expect(computePrepCompletion(allDone)).toBe(1);
  });
  it('3 of 5 done → 0.6', () => {
    expect(
      computePrepCompletion({
        ...allPending,
        documents: { status: 'COMPLETE' },
        health: { status: 'NA' },
        weather: { status: 'COMPLETE' },
      }),
    ).toBeCloseTo(0.6, 5);
  });
  it('handles null/undefined input as 0', () => {
    expect(computePrepCompletion(null)).toBe(0);
    expect(computePrepCompletion(undefined)).toBe(0);
    expect(computePrepCompletion('not-an-object')).toBe(0);
  });
});

describe('computeCartCompletion', () => {
  it('null cart → 0', () => {
    expect(computeCartCompletion(null)).toBe(0);
  });
  it('only FLIGHT items → 0 (FLIGHT tracked separately)', () => {
    expect(computeCartCompletion({ items: [{ kind: 'FLIGHT' }] })).toBe(0);
  });
  it('1 ancillary kind → 1/3', () => {
    expect(
      computeCartCompletion({ items: [{ kind: 'ACTIVITY' }] }),
    ).toBeCloseTo(1 / 3, 5);
  });
  it('all 3 ancillary kinds → 1', () => {
    expect(
      computeCartCompletion({
        items: [
          { kind: 'ACTIVITY' },
          { kind: 'TRANSFER' },
          { kind: 'DINING' },
        ],
      }),
    ).toBe(1);
  });
  it('saturates at 1 when extra OTHER items present', () => {
    expect(
      computeCartCompletion({
        items: [
          { kind: 'ACTIVITY' },
          { kind: 'TRANSFER' },
          { kind: 'DINING' },
          { kind: 'OTHER' },
        ],
      }),
    ).toBe(1);
  });
});

describe('computeFlightCompletion', () => {
  it('flightBookingId set → 1', () => {
    expect(computeFlightCompletion('fb-1', null)).toBe(1);
  });
  it('FLIGHT cart line → 1', () => {
    expect(
      computeFlightCompletion(null, { items: [{ kind: 'FLIGHT' }] }),
    ).toBe(1);
  });
  it('neither → 0', () => {
    expect(computeFlightCompletion(null, { items: [] })).toBe(0);
    expect(computeFlightCompletion(null, null)).toBe(0);
  });
});

describe('computeCompletionPercent (integrated)', () => {
  const bareTrip = { flightBookingId: null, preparationStatus: allPending };
  const fullTrip = { flightBookingId: 'fb-1', preparationStatus: allDone };

  it('bare Trip → 0', () => {
    expect(computeCompletionPercent({ trip: bareTrip, cart: null })).toBe(0);
  });

  it('fully-built Trip → 100', () => {
    expect(
      computeCompletionPercent({
        trip: fullTrip,
        cart: {
          items: [
            { kind: 'ACTIVITY' },
            { kind: 'TRANSFER' },
            { kind: 'DINING' },
          ],
        },
      }),
    ).toBe(100);
  });

  it('half-state: 60% prep + empty cart + no flight → round(50 * 0.6) = 30', () => {
    expect(
      computeCompletionPercent({
        trip: {
          flightBookingId: null,
          preparationStatus: {
            ...allPending,
            documents: { status: 'COMPLETE' },
            health: { status: 'NA' },
            weather: { status: 'COMPLETE' },
          },
        },
        cart: { items: [] },
      }),
    ).toBe(30);
  });
});
