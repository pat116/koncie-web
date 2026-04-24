import { describe, it, expectTypeOf } from 'vitest';
import type { FlightBookingRead, FlightItinerarySource } from './flights';

describe('flights types', () => {
  it('FlightItinerarySource has exactly one method', () => {
    type Methods = keyof FlightItinerarySource;
    expectTypeOf<Methods>().toEqualTypeOf<'fetchBookingsForGuest'>();
  });

  it('FlightBookingRead.returnAt is nullable', () => {
    const oneWay: FlightBookingRead = {
      externalRef: 'JS-1',
      guestEmail: 'a@b.com',
      origin: 'SYD',
      destination: 'NAN',
      departureAt: '2026-07-14T08:00:00+10:00',
      returnAt: null,
      carrier: 'FJ',
      metadata: {},
    };
    expectTypeOf(oneWay.returnAt).toEqualTypeOf<string | null>();
  });
});
