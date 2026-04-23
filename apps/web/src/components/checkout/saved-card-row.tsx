export interface SavedCardRowProps {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  selected: boolean;
  onSelectName: string; // radio input name
}

const BRAND_SYMBOL: Record<string, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  AMEX: 'Amex',
  OTHER: 'Card',
};

export function SavedCardRow({
  id,
  brand,
  last4,
  expiryMonth,
  expiryYear,
  selected,
  onSelectName,
}: SavedCardRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-koncie-border bg-white p-3 text-sm">
      <input type="radio" name={onSelectName} value={id} defaultChecked={selected} />
      <span className="flex-1">
        <span className="font-semibold text-koncie-navy">
          {BRAND_SYMBOL[brand] ?? 'Card'} ending {last4}
        </span>
        <span className="ml-2 text-xs text-koncie-charcoal/60">
          Expires {String(expiryMonth).padStart(2, '0')}/{String(expiryYear).slice(-2)}
        </span>
      </span>
    </label>
  );
}
