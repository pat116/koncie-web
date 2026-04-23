import Link from 'next/link';
import { PricePair } from './price-pair';
import { convertMinorUnits } from '@/lib/money';

export interface ActivityCardProps {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  priceCurrency: string;
  imageUrl: string;
}

export function ActivityCard({
  id,
  name,
  description,
  priceMinor,
  priceCurrency,
  imageUrl,
}: ActivityCardProps) {
  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: priceMinor,
    from: priceCurrency,
    to: 'AUD',
  });

  return (
    <Link
      href={`/hub/activities/${id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-koncie-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className="aspect-[4/3] bg-koncie-sand bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold text-koncie-navy">{name}</h3>
        <p className="line-clamp-2 text-xs text-koncie-charcoal/80">{description}</p>
        <div className="mt-auto pt-2">
          <PricePair
            amountMinor={priceMinor}
            currency={priceCurrency}
            guestDisplayAmountMinor={guestDisplayAmountMinor}
            guestDisplayCurrency="AUD"
            size="md"
          />
        </div>
      </div>
    </Link>
  );
}
