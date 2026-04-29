import { describe, it, expect } from 'vitest';
import { inferOriginAirportIata } from '../originAirport';

describe('inferOriginAirportIata', () => {
  it('Sydney 2000 → SYD', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '2000' }),
    ).toBe('SYD');
  });

  it('Melbourne 3000 → MEL', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '3000' }),
    ).toBe('MEL');
  });

  it('Gold Coast 4217 → OOL', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '4217' }),
    ).toBe('OOL');
  });

  it('handles "Australia" full name as country', () => {
    expect(
      inferOriginAirportIata({ country: 'Australia', postcode: '6000' }),
    ).toBe('PER');
  });

  it('returns null for non-AU country', () => {
    expect(
      inferOriginAirportIata({ country: 'US', postcode: '90210' }),
    ).toBeNull();
  });

  it('returns null for missing postcode', () => {
    expect(inferOriginAirportIata({ country: 'AU' })).toBeNull();
  });

  it('returns null for malformed postcode', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '20' }),
    ).toBeNull();
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: 'abcd' }),
    ).toBeNull();
  });

  it('returns null for null/undefined address (defensive per kickoff §6 #1)', () => {
    expect(inferOriginAirportIata(null)).toBeNull();
    expect(inferOriginAirportIata(undefined)).toBeNull();
  });


  it('Hobart 7000 → HBA', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '7000' }),
    ).toBe('HBA');
  });

  it('Darwin 0820 → DRW', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '0820' }),
    ).toBe('DRW');
  });
  it('returns null for postcode prefix not in mapping', () => {
    expect(
      inferOriginAirportIata({ country: 'AU', postcode: '0500' }), // 05 not mapped (no NT-coastal entry)
    ).toBeNull();
  });
});
