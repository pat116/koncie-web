import { formatPricePair } from '@/lib/money';

export interface PricePairProps {
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PricePair({ size = 'md', ...rest }: PricePairProps) {
  const classes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base font-semibold',
  }[size];
  return <span className={`text-koncie-charcoal ${classes}`}>{formatPricePair(rest)}</span>;
}
