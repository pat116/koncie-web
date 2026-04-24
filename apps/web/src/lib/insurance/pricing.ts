/**
 * Sprint 4 commission + fee split for insurance premiums.
 *
 * The Koncie board brief §3 pins insurance at ~30% commission. In Sprint 4
 * we hardcode 30.00%; a future sprint can read this from config when
 * provider-specific rates land.
 */
export const INSURANCE_COMMISSION_PCT = 30.0 as const;

/**
 * Split a premium into the provider payout (underwriter) and the Koncie fee
 * (commission). Rounds the commission down to integer minor units so the
 * provider payout absorbs any rounding remainder — matches Sprint 2's
 * computeFeeSplit convention in @/lib/money.
 */
export function splitInsurancePremium(premiumMinor: number): {
  providerPayoutMinor: number;
  koncieFeeMinor: number;
  commissionPct: number;
} {
  const koncieFeeMinor = Math.floor((premiumMinor * INSURANCE_COMMISSION_PCT) / 100);
  const providerPayoutMinor = premiumMinor - koncieFeeMinor;
  return {
    providerPayoutMinor,
    koncieFeeMinor,
    commissionPct: INSURANCE_COMMISSION_PCT,
  };
}
