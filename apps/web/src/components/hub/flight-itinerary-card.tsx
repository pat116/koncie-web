import type { FlightBooking } from '@prisma/client';

interface FlightItineraryCardProps {
  flight: FlightBooking;
  /** Set false to hide the green "NEW" pill after the pilot rollout. */
  showNewPill?: boolean;
}

// Format in Australia/Sydney zone for the Sprint 3 pilot (all flights origin AU).
// Sprint-N: thread origin IATA and map to a per-airport timezone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShort(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  const monthNum = Number(parts.find((p) => p.type === 'month')!.value);
  const hh = parts.find((p) => p.type === 'hour')!.value.padStart(2, '0');
  const mm = parts.find((p) => p.type === 'minute')!.value.padStart(2, '0');
  return `${day} ${MONTHS[monthNum - 1]} \u00b7 ${hh}:${mm}`;
}

export function FlightItineraryCard({ flight, showNewPill = true }: FlightItineraryCardProps) {
  const { origin, destination, departureAt, returnAt, carrier } = flight;

  return (
    <section className="mt-2 rounded-2xl bg-koncie-navy px-5 py-4 text-koncie-sand">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-koncie-green">
        Your flight
        {showNewPill && (
          <span className="ml-2 inline-block rounded-full bg-koncie-green px-2 py-0.5 text-[9px] font-semibold text-koncie-navy">
            NEW
          </span>
        )}
      </p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-semibold">{origin} &rarr; {destination}</span>
        <span className="text-koncie-sand/70 text-xs">{formatShort(departureAt)}</span>
      </div>
      {returnAt && (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="font-semibold">{destination} &rarr; {origin}</span>
          <span className="text-koncie-sand/70 text-xs">{formatShort(returnAt)}</span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-koncie-sand/60">
        Carrier {carrier} &middot; via Jet Seeker
      </p>
    </section>
  );
}

export default FlightItineraryCard;
