'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { redirect } from 'next/navigation';

export async function fireMagicLink(formData: FormData) {
  const bookingId = formData.get('bookingId');
  if (typeof bookingId !== 'string') {
    redirect('/welcome?error=bad_booking_id');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { guest: true },
  });
  if (!booking) {
    redirect('/welcome?error=booking_not_found');
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: booking.guest.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    console.error('[fireMagicLink] Supabase error:', error.message);
    redirect(`/register?bookingId=${bookingId}&error=send_failed`);
  }

  redirect(`/register?bookingId=${bookingId}&sent=1`);
}
