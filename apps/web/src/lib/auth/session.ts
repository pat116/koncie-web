import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

/**
 * Server-side guard — redirects to /welcome when the request has no Supabase
 * session, no matching Guest row, or no upcoming booking.
 *
 * Returns { guest, booking } where booking includes `.property`.
 *
 * Sprint 1 pages used inline Supabase auth; new Sprint 2 pages use this helper
 * for consistency. The Guest lookup uses `authUserId` (if set) then falls back
 * to `email` so it works for both flows.
 */
export async function requireSignedInGuest() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/welcome');

  const guest = await prisma.guest.findFirst({
    where: user.id
      ? { OR: [{ authUserId: user.id }, { email: user.email }] }
      : { email: user.email },
    include: {
      hotelBookings: {
        include: { property: true },
        orderBy: { checkIn: 'asc' },
        take: 1,
      },
    },
  });

  if (!guest) redirect('/welcome?error=no_guest_record');
  if (guest.hotelBookings.length === 0) redirect('/welcome?error=no_booking');

  const booking = guest.hotelBookings[0]!;

  return { guest, booking };
}
