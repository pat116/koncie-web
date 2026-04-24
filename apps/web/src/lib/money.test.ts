import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatPricePair,
  convertMinorUnits,
  computeFeeSplit,
  fxRateFor,
  FX_RATES,
} from './money';

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

describe('fxRateFor', () => {
  it('returns a 6-decimal-place string for FJD to AUD (Sprint 2 anchor rate)', () => {
    // decimal(12,6) is the column type on Transaction.fx_rate_at_purchase
    expect(fxRateFor('FJD', 'AUD')).toBe('0.670000');
  });

  it('returns the inverse rate for AUD to FJD', () => {
    expect(fxRateFor('AUD', 'FJD')).toBe('1.490000');
  });

  it("returns '1.000000' for identity conversions", () => {
    expect(fxRateFor('AUD', 'AUD')).toBe('1.000000');
    expect(fxRateFor('FJD', 'FJD')).toBe('1.000000');
  });

  it('throws when no FX rate is configured for the requested pair', () => {
    // JPY is intentionally absent from FX_RATES in Sprint 2
    expect(() => fxRateFor('JPY', 'AUD')).toThrow(/no FX rate/i);
  });

  it('always returns exactly 6 decimal places', () => {
    for (const rate of [
      fxRateFor('FJD', 'AUD'),
      fxRateFor('AUD', 'NZD'),
      fxRateFor('USD', 'USD'),
    ]) {
      const [, fractional] = rate.split('.');
      expect(fractional).toHaveLength(6);
    }
  });
});
