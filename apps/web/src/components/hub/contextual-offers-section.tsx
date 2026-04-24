import Link from 'next/link';
import type { ContextualOffer } from '@/lib/flights/contextual-offers';

interface ContextualOffersSectionProps {
  offers: ContextualOffer[];
}

export function ContextualOffersSection({ offers }: ContextualOffersSectionProps) {
  if (offers.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {offers.map((offer, i) => {
        if (offer.type === 'activities-deep-link') {
          return (
            <Link
              key={i}
              href={offer.href}
              className="block rounded-xl bg-koncie-green px-4 py-3 text-sm text-koncie-navy"
            >
              <p className="font-semibold">{offer.title}</p>
              <p className="text-[11px] opacity-80">{offer.subtitle}</p>
            </Link>
          );
        }
        // insurance-stub
        return (
          <div
            key={i}
            className="rounded-xl border border-koncie-border bg-white px-4 py-3 text-sm"
          >
            <p className="font-semibold text-koncie-navy">Travel protection &middot; Coming soon</p>
            <p className="text-[11px] text-koncie-charcoal/70">
              Covers your {offer.departureDateLabel} flight to {offer.destinationLabel}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default ContextualOffersSection;
