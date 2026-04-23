import { formatPricePair } from '@/lib/money';

interface AddonRow {
  id: string;
  name: string;
  createdAt: Date;
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
}

export function AddonsSection({ rows }: { rows: AddonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-koncie-border bg-white p-4">
      <h2 className="text-sm font-semibold text-koncie-navy">Your add-ons</h2>
      <ul className="mt-3 flex flex-col divide-y divide-koncie-border/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-3">
            <span className="text-sm text-koncie-charcoal">{r.name}</span>
            <span className="text-xs font-mono text-koncie-charcoal/80">
              {formatPricePair({
                amountMinor: r.amountMinor,
                currency: r.currency,
                guestDisplayAmountMinor: r.guestDisplayAmountMinor,
                guestDisplayCurrency: r.guestDisplayCurrency,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
