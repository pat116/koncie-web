import Link from 'next/link';
import Image from 'next/image';
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
      <div className="relative aspect-[4/3] bg-koncie-sand">
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
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
