import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { verifyMagicLink } from '@/lib/auth/signed-link';
import { SignedLinkError } from '@/lib/errors';
import { BookingSummaryCard } from '@/components/welcome/booking-summary-card';
import { PreviewCard } from '@/components/welcome/preview-card';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { token?: string };
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const token = searchParams.token;
  if (!token) return <LinkExpiredState />;

  let payload;
  try {
    payload = await verifyMagicLink(token);
  } catch (e) {
    if (e instanceof SignedLinkError) return <LinkExpiredState />;
    throw e;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: { guest: true, property: true },
  });

  if (!booking || booking.guest.email !== payload.guestEmail) {
    return <LinkExpiredState />;
  }

  return (
    <main className="min-h-screen bg-koncie-sand">
      <header className="bg-koncie-navy px-5 py-4 text-center">
        <h1 className="font-semibold text-white">Koncie</h1>
      </header>

      <section className="mx-auto max-w-md px-5 pt-8">
        <h2 className="text-2xl font-bold text-koncie-navy">
          Hi {booking.guest.firstName} ✨
        </h2>
        <p className="mt-2 text-sm text-koncie-charcoal">
          Your {booking.property.name} stay starts{' '}
          <span className="font-semibold">
            {booking.checkIn.toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </p>

        <div className="mt-5">
          <BookingSummaryCard
            summary={{
              propertyName: booking.property.name,
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              numGuests: booking.numGuests,
              externalRef: booking.externalRef,
            }}
          />
        </div>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-koncie-navy">
          What&apos;s waiting for you
        </h3>
        <div className="mt-3 space-y-3">
          <PreviewCard
            icon="🏄"
            title="Activities at the resort"
            subtitle="Surf, dive, fish — see them all"
          />
          <PreviewCard
            icon="🛡️"
            title="Travel protection"
            subtitle="Recommended for Fiji travel"
          />
          <PreviewCard
            icon="✈️"
            title="Flight add-ons"
            subtitle="Powered by JetSeeker"
          />
        </div>

        <div className="mt-8 pb-12">
          <Link
            href={`/register?bookingId=${booking.id}`}
            className="block rounded-full bg-koncie-navy px-5 py-4 text-center text-sm font-semibold text-white"
          >
            Create your Koncie account
          </Link>
          <p className="mt-4 text-center text-xs text-koncie-charcoal/60">
            Already have one?{' '}
            <Link
              href={`/register?bookingId=${booking.id}&signin=true`}
              className="text-koncie-green underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function LinkExpiredState() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-2xl font-bold text-koncie-navy">
        This link has expired
      </h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        Please contact your host to get a fresh link.
      </p>
    </main>
  );
}
