import { describe, it, expect } from 'vitest';
import { splitInsurancePremium, INSURANCE_COMMISSION_PCT } from './pricing';

describe('splitInsurancePremium', () => {
  it('splits a premium at the 30% brief rate', () => {
    const { koncieFeeMinor, providerPayoutMinor, commissionPct } = splitInsurancePremium(10_000);
    expect(commissionPct).toBe(30);
    expect(koncieFeeMinor).toBe(3_000);
    expect(providerPayoutMinor).toBe(7_000);
  });

  it('the split sums exactly to the input amount (rounding absorbed by payout)', () => {
    const premium = 14_900; // Comprehensive tier
    const { koncieFeeMinor, providerPayoutMinor } = splitInsurancePremium(premium);
    expect(koncieFeeMinor + providerPayoutMinor).toBe(premium);
  });

  it('rounds commission DOWN so Koncie never over-collects vs nominal 30%', () => {
    // 899 × 30% = 269.7 → commission 269, payout 630 = 899 ✓
    const { koncieFeeMinor, providerPayoutMinor } = splitInsurancePremium(899);
    expect(koncieFeeMinor).toBe(269);
    expect(providerPayoutMinor).toBe(630);
  });

  it('exports the commission rate for audit/config consumption', () => {
    expect(INSURANCE_COMMISSION_PCT).toBe(30.0);
  });
});
