import { format } from 'date-fns';

export interface BookingSummary {
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
  externalRef: string;
}

export function BookingSummaryCard({ summary }: { summary: BookingSummary }) {
  const nights = Math.round(
    (summary.checkOut.getTime() - summary.checkIn.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return (
    <div className="rounded-xl border border-koncie-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
        {nights}-NIGHT STAY · {summary.numGuests} GUESTS
      </p>
      <h3 className="mt-1 text-base font-semibold text-koncie-charcoal">
        {summary.propertyName}
      </h3>
      <p className="text-xs text-koncie-charcoal/60">
        {format(summary.checkIn, 'd MMM yyyy')} –{' '}
        {format(summary.checkOut, 'd MMM yyyy')} · ref {summary.externalRef}
      </p>
    </div>
  );
}
