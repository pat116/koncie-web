import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { magicLinkTemplate } from './templates/magic-link';

export type FireMagicLinkInput = {
  bookingId: string;
};

export type FireMagicLinkResult =
  | { ok: true; messageLogId: string }
  | { ok: false; reason: 'booking_not_found' | 'send_failed'; detail?: string };

/**
 * Fires a magic-link email to the booking's guest.
 *
 * Delivery channel is Supabase OTP (which emits the email via its configured
 * SMTP — Resend in staging/prod). We keep Supabase as the delivery path for
 * magic links because Supabase's `verifyOtp` needs the token hash it
 * generated — we can't substitute a bespoke Resend send without breaking the
 * verification round-trip.
 *
 * This wrapper adds the MessageLog audit row that was missing pre-Sprint 6.
 * The row is marked SENT immediately on Supabase-OTP success — Supabase
 * doesn't expose a delivery webhook at our tier, so SENT is terminal here.
 * For the three Resend-delivered templates, status progresses through the
 * webhook at /api/resend/webhook.
 */
export async function fireMagicLinkForBooking(
  input: FireMagicLinkInput,
): Promise<FireMagicLinkResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { guest: true, property: true },
  });
  if (!booking) return { ok: false, reason: 'booking_not_found' };

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: booking.guest.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { bookingId: booking.id, path: 'fireMagicLinkForBooking' },
    });
    // Log a FAILED audit row so the admin view reflects the attempt.
    await prisma.messageLog.create({
      data: {
        guestId: booking.guestId,
        bookingId: booking.id,
        kind: 'MAGIC_LINK',
        templateId: magicLinkTemplate.id,
        recipientEmail: booking.guest.email,
        subject: magicLinkTemplate.subject({
          firstName: booking.guest.firstName,
          propertyName: booking.property.name,
          magicLinkUrl: '',
        }),
        status: 'FAILED',
        failureReason: error.message,
        metadata: { transport: 'supabase_otp' },
      },
    });
    return { ok: false, reason: 'send_failed', detail: error.message };
  }

  const subject = magicLinkTemplate.subject({
    firstName: booking.guest.firstName,
    propertyName: booking.property.name,
    magicLinkUrl: '',
  });

  const now = new Date();
  const log = await prisma.messageLog.create({
    data: {
      guestId: booking.guestId,
      bookingId: booking.id,
      kind: 'MAGIC_LINK',
      templateId: magicLinkTemplate.id,
      recipientEmail: booking.guest.email,
      subject,
      status: 'SENT',
      sentAt: now,
      metadata: { transport: 'supabase_otp' },
    },
  });

  return { ok: true, messageLogId: log.id };
}
