'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { signMagicLink } from '@/lib/auth/signed-link';

/**
 * Demo launcher — signs a fresh 30-minute magic link for the seeded Namotu
 * booking and redirects to /welcome. Used by the homepage demo CTA so
 * stakeholders can see the post-booking flow without a real booking email.
 */
export async function startDemo() {
  const booking = await prisma.booking.findUnique({
    where: { externalRef: 'HL-84321-NMT' },
    include: { guest: true },
  });

  if (!booking) {
    throw new Error(
      'Demo booking not found. Run `pnpm --filter @koncie/web db:seed` to populate it.',
    );
  }

  const token = await signMagicLink({
    bookingId: booking.id,
    guestEmail: booking.guest.email,
    expiresInSeconds: 60 * 30, // 30 minutes
  });

  redirect(`/welcome?token=${token}`);
}
