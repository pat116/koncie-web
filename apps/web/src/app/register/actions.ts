'use server';

import { redirect } from 'next/navigation';
import { fireMagicLinkForBooking } from '@/lib/messaging/magic-link';

export async function fireMagicLink(formData: FormData) {
  const bookingId = formData.get('bookingId');
  if (typeof bookingId !== 'string') {
    redirect('/welcome?error=bad_booking_id');
  }

  const result = await fireMagicLinkForBooking({ bookingId });

  if (!result.ok) {
    if (result.reason === 'booking_not_found') {
      redirect('/welcome?error=booking_not_found');
    }
    redirect(`/register?bookingId=${bookingId}&error=send_failed`);
  }

  redirect(`/register?bookingId=${bookingId}&sent=1`);
}
