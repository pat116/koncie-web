'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OfferInsuranceQuoteInput } from '@/lib/flights/contextual-offers';

interface InsuranceOfferCardProps {
  destinationLabel: string;
  departureDateLabel: string;
  quotes: OfferInsuranceQuoteInput[];
  defaultQuoteId: string;
}

const TIER_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  comprehensive: 'Comprehensive',
  comprehensive_plus: 'Comprehensive+',
};

function formatPrice(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/**
 * Sprint 4 — Travel protection offer. Three CoverMore tiers side by side;
 * Comprehensive pre-selected per approved spec. Tap a tier to re-select;
 * CTA deep-links to /hub/checkout/insurance/[quoteId] with the chosen id.
 */
export function InsuranceOfferCard({
  destinationLabel,
  departureDateLabel,
  quotes,
  defaultQuoteId,
}: InsuranceOfferCardProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(defaultQuoteId);
  const selected = quotes.find((q) => q.id === selectedQuoteId) ?? quotes[0];

  return (
    <section className="rounded-2xl border border-koncie-border bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-koncie-navy">Travel protection</p>
        <p className="text-[11px] text-koncie-charcoal/70">via CoverMore</p>
      </div>
      <p className="mt-0.5 text-[11px] text-koncie-charcoal/70">
        Covers your {departureDateLabel} flight to {destinationLabel}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Coverage tier">
        {quotes.map((q) => {
          const isSelected = q.id === selectedQuoteId;
          return (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedQuoteId(q.id)}
              className={[
                'rounded-xl border px-2 py-2 text-left text-[11px] transition',
                isSelected
                  ? 'border-koncie-navy bg-koncie-navy text-koncie-sand'
                  : 'border-koncie-border bg-koncie-sand/40 text-koncie-charcoal',
              ].join(' ')}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                {TIER_LABELS[q.tier] ?? q.tier}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {formatPrice(q.premiumMinor, q.currency)}
              </p>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="mt-2 text-[11px] text-koncie-charcoal/70">
          {selected.coverageSummary}
        </p>
      )}

      <Link
        href={`/hub/checkout/insurance/${selectedQuoteId}`}
        className="mt-3 block rounded-xl bg-koncie-green px-4 py-2 text-center text-sm font-semibold text-koncie-navy"
      >
        Protect your trip
      </Link>
    </section>
  );
}

export default InsuranceOfferCard;
