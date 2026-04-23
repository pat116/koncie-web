import Decimal from 'decimal.js';

const SYMBOLS: Record<string, string> = {
  FJD: 'FJ$',
  AUD: 'AU$',
  NZD: 'NZ$',
  USD: 'US$',
};

export function formatMoney(amountMinor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const major = new Decimal(amountMinor).dividedBy(100).toFixed(2);
  return `${symbol}${major}`;
}

export interface PricePairInput {
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
}

export function formatPricePair(input: PricePairInput): string {
  return `${formatMoney(input.amountMinor, input.currency)} ≈ ${formatMoney(
    input.guestDisplayAmountMinor,
    input.guestDisplayCurrency,
  )}`;
}

/**
 * Sprint 2 uses hardcoded FX rates. Sprint 3 swaps in a rates-API snapshot
 * captured at the moment of charge and written to `Transaction.fx_rate_at_purchase`.
 */
export const FX_RATES: Record<string, Record<string, string>> = {
  FJD: { AUD: '0.67', NZD: '0.73', USD: '0.44' },
  AUD: { FJD: '1.49', NZD: '1.09', USD: '0.66' },
};

export interface ConvertInput {
  amountMinor: number;
  from: string;
  to: string;
}

export function convertMinorUnits({ amountMinor, from, to }: ConvertInput): number {
  if (from === to) return amountMinor;
  const rate = FX_RATES[from]?.[to];
  if (!rate) {
    throw new Error(`no FX rate configured for ${from} → ${to}`);
  }
  return new Decimal(amountMinor).times(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export interface FeeSplitInput {
  amountMinor: number;
  /** Decimal-precision percentage as string, e.g. "85.00" */
  providerPayoutPct: string;
}

export interface FeeSplit {
  providerPayoutMinor: number;
  koncieFeeMinor: number;
}

export function computeFeeSplit({ amountMinor, providerPayoutPct }: FeeSplitInput): FeeSplit {
  const providerPayoutMinor = new Decimal(amountMinor)
    .times(providerPayoutPct)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .toNumber();
  const koncieFeeMinor = amountMinor - providerPayoutMinor;
  return { providerPayoutMinor, koncieFeeMinor };
}

/** Hardcoded Sprint 2 FX anchor used by the checkout server action. */
export function fxRateFor(from: string, to: string): string {
  if (from === to) return '1.000000';
  const rate = FX_RATES[from]?.[to];
  if (!rate) throw new Error(`no FX rate configured for ${from} → ${to}`);
  return new Decimal(rate).toFixed(6);
}
