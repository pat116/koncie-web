import Link from 'next/link';
import type { ContextualOffer } from '@/lib/flights/contextual-offers';
import { InsuranceOfferCard } from './insurance-offer-card';

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
        // insurance-offer
        return (
          <InsuranceOfferCard
            key={i}
            destinationLabel={offer.destinationLabel}
            departureDateLabel={offer.departureDateLabel}
            quotes={offer.quotes}
            defaultQuoteId={offer.defaultQuoteId}
          />
        );
      })}
    </div>
  );
}

export default ContextualOffersSection;
