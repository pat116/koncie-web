import { format, differenceInCalendarDays } from 'date-fns';
import Link from 'next/link';

export interface BookingHeroProps {
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
}

export function BookingHero({
  propertyName,
  checkIn,
  checkOut,
  numGuests,
}: BookingHeroProps) {
  const daysUntil = differenceInCalendarDays(checkIn, new Date());
  return (
    <section className="rounded-2xl bg-koncie-navy p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-green">
        Your upcoming trip
      </p>
      <h2 className="mt-2 text-xl font-bold">{propertyName}</h2>
      <p className="mt-1 text-sm text-white/80">
        {format(checkIn, 'd')} – {format(checkOut, 'd MMMM yyyy')} ·{' '}
        {numGuests} guests
      </p>
      <div className="mt-4 flex items-center justify-between">
        <Link
          href="/hub/trip"
          className="rounded-full bg-koncie-green px-4 py-2 text-xs font-semibold text-koncie-navy"
        >
          View details
        </Link>
        <p className="text-xs text-white/60">
          {daysUntil >= 0 ? `in ${daysUntil} days` : 'now'}
        </p>
      </div>
    </section>
  );
}
