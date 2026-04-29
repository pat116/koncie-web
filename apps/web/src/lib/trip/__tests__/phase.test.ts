import { describe, it, expect } from 'vitest';
import { derivePhase, localDateAtTz } from '../phase';

const FIJI_TZ = 'Pacific/Fiji'; // UTC+12 (no DST)

const checkIn = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15 — UTC midnight
const checkOut = new Date(Date.UTC(2026, 6, 22)); // 2026-07-22

describe('localDateAtTz', () => {
  it('15:00 Pacific/Fiji on 2026-07-15 = 2026-07-15T03:00Z', () => {
    const utc = localDateAtTz(checkIn, '15:00', FIJI_TZ);
    expect(utc.toISOString()).toBe('2026-07-15T03:00:00.000Z');
  });

  it('11:00 Pacific/Fiji on 2026-07-22 = 2026-07-21T23:00Z', () => {
    const utc = localDateAtTz(checkOut, '11:00', FIJI_TZ);
    expect(utc.toISOString()).toBe('2026-07-21T23:00:00.000Z');
  });

  it('handles UTC tz (offset 0)', () => {
    const utc = localDateAtTz(checkIn, '15:00', 'Etc/UTC');
    expect(utc.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });
});

describe('derivePhase', () => {
  const base = {
    checkIn,
    checkOut,
    propertyTimezone: FIJI_TZ,
  };

  it('PRE_CONFIRMATION when booking is not CONFIRMED', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CANCELLED',
        now: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toBe('PRE_CONFIRMATION');
  });

  it('PRE_ARRIVAL when now is before check-in (Fiji 15:00)', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CONFIRMED',
        now: new Date('2026-07-15T02:59:59Z'),
      }),
    ).toBe('PRE_ARRIVAL');
  });

  it('IN_STAY at the check-in instant', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CONFIRMED',
        now: new Date('2026-07-15T03:00:00Z'),
      }),
    ).toBe('IN_STAY');
  });

  it('IN_STAY mid-stay', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CONFIRMED',
        now: new Date('2026-07-18T12:00:00Z'),
      }),
    ).toBe('IN_STAY');
  });

  it('IN_STAY at the check-out instant', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CONFIRMED',
        now: new Date('2026-07-21T23:00:00Z'),
      }),
    ).toBe('IN_STAY');
  });

  it('POST_STAY one millisecond after check-out', () => {
    expect(
      derivePhase({
        ...base,
        hotelBookingStatus: 'CONFIRMED',
        now: new Date('2026-07-21T23:00:00.001Z'),
      }),
    ).toBe('POST_STAY');
  });
});
