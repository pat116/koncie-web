import { describe, it, expect } from 'vitest';
import { formatMoney, formatPricePair, convertMinorUnits, computeFeeSplit, FX_RATES } from './money';

describe('formatMoney', () => {
  it('formats FJD with proper symbol and decimals', () => {
    expect(formatMoney(7500, 'FJD')).toBe('FJ$75.00');
  });

  it('formats AUD with proper symbol', () => {
    expect(formatMoney(5025, 'AUD')).toBe('AU$50.25');
  });

  it('handles zero', () => {
    expect(formatMoney(0, 'FJD')).toBe('FJ$0.00');
  });
});

describe('formatPricePair', () => {
  it('renders the "FJ$75 ≈ AU$50" guest-facing pair', () => {
    expect(
      formatPricePair({
        amountMinor: 7500,
        currency: 'FJD',
        guestDisplayAmountMinor: 5025,
        guestDisplayCurrency: 'AUD',
      }),
    ).toBe('FJ$75.00 ≈ AU$50.25');
  });
});

describe('convertMinorUnits', () => {
  it('converts FJD to AUD at hardcoded Sprint 2 rate 0.67', () => {
    expect(convertMinorUnits({ amountMinor: 7500, from: 'FJD', to: 'AUD' })).toBe(5025);
  });

  it('returns the same amount when source === destination', () => {
    expect(convertMinorUnits({ amountMinor: 1234, from: 'AUD', to: 'AUD' })).toBe(1234);
  });

  it('rounds half-up at the minor-unit boundary', () => {
    // 100 FJD * 0.67 = 67 AUD exact
    expect(convertMinorUnits({ amountMinor: 100, from: 'FJD', to: 'AUD' })).toBe(67);
    // 101 FJD * 0.67 = 67.67 → rounds to 68
    expect(convertMinorUnits({ amountMinor: 101, from: 'FJD', to: 'AUD' })).toBe(68);
  });

  it('throws on unknown currency pair', () => {
    expect(() =>
      convertMinorUnits({ amountMinor: 100, from: 'JPY', to: 'AUD' }),
    ).toThrow(/no FX rate/i);
  });
});

describe('computeFeeSplit', () => {
  it('splits 7500 FJD at 85% provider payout → 6375 provider, 1125 koncie', () => {
    const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
      amountMinor: 7500,
      providerPayoutPct: '85.00',
    });
    expect(providerPayoutMinor).toBe(6375);
    expect(koncieFeeMinor).toBe(1125);
    expect(providerPayoutMinor + koncieFeeMinor).toBe(7500);
  });

  it('floors provider payout and gives rounding residue to koncie', () => {
    // 100 * 85.33 / 100 = 85.33 → floor 85; koncie = 15
    const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
      amountMinor: 100,
      providerPayoutPct: '85.33',
    });
    expect(providerPayoutMinor).toBe(85);
    expect(koncieFeeMinor).toBe(15);
  });

  it('invariant: split always sums to input', () => {
    for (const amount of [1, 99, 7500, 12345, 100000]) {
      const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
        amountMinor: amount,
        providerPayoutPct: '85.00',
      });
      expect(providerPayoutMinor + koncieFeeMinor).toBe(amount);
    }
  });
});
