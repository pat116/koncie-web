/**
 * Pre-arrival comms cron — invoked daily by Vercel Cron at 02:00 UTC
 * (~midday Sydney). Scans for guests in the T-7, T-3, and T-0 windows and
 * dispatches the corresponding reminder template.
 *
 * Triggers (one channel per window — open question Q1 in the completion
 * brief, locked here as the recommendation):
 *  - `UPSELL_REMINDER_T7` (email) — guests with a CONFIRMED booking whose
 *    checkIn is 6d 12h..7d 12h out, who haven't been sent this kind in the
 *    last 14 days.
 *  - `INSURANCE_REMINDER_T3` (email) — same window but 2d 12h..3d 12h, AND
 *    the guest has no ACTIVE insurance policy.
 *  - `PRE_ARRIVAL_SMS` (Twilio SMS) — same T-3 window. Guest must have a
 *    phone on file. The body deep-links to /c/[chatToken]. Independent of
 *    insurance state: the SMS is the chat hook, not a payment CTA.
 *  - `WELCOME_TO_RESORT` (Notification, no comms) — fires at T-0 (today's
 *    check-in). Reuses this cron rather than spinning a second entry.
 *
 * Idempotency: the 14-day MessageLog look-back means re-invoking the cron
 * within the same hour is a no-op for already-dispatched rows. WELCOME_TO_RESORT
 * notifications dedupe on existing-row-of-kind for the booking.
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { sendMessage } from '@/lib/messaging/send';
import { sendSms } from '@/lib/messaging/sms/twilio';
import { upsellReminderT7Template } from '@/lib/messaging/templates/upsell-reminder-t7';
import { insuranceReminderT3Template } from '@/lib/messaging/templates/insurance-reminder-t3';
import { preArrivalSmsTemplate } from '@/lib/messaging/templates/pre-arrival-sms';
import { mintChatToken } from '@/lib/chat/tokens';
import { getOrCreateConversation } from '@/lib/chat/store';
import { createWelcomeToResortNotification } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

function windowForDaysAway(now: Date, days: number): { from: Date; to: Date } {
  // Each ±12h window — catches guests whose checkIn date-part is `days` away
  // regardless of the time-of-day semantics of HotelBooking.checkIn (stored as
  // @db.Date). With Date at 00:00 UTC, a 12h half-width reliably hits the
  // intended calendar day for all TZ offsets we care about.
  const center = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const from = new Date(center.getTime() - 12 * 60 * 60 * 1000);
  const to = new Date(center.getTime() + 12 * 60 * 60 * 1000);
  return { from, to };
}

function formatCheckInDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function alreadyDispatchedInLast14d(
  guestId: string,
  bookingId: string,
  kind: 'UPSELL_REMINDER_T7' | 'INSURANCE_REMINDER_T3' | 'PRE_ARRIVAL_SMS',
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const hit = await prisma.messageLog.findFirst({
    where: {
      guestId,
      bookingId,
      kind,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return hit !== null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const t7Window = windowForDaysAway(now, 7);
  const t3Window = windowForDaysAway(now, 3);
  const t0Window = windowForDaysAway(now, 0);

  const counts = {
    t7Dispatched: 0,
    t3Dispatched: 0,
    smsDispatched: 0,
    welcomeNotifications: 0,
    skipped: 0,
  };

  // ─── T-7 upsell reminder ────────────────────────────────────────────────
  const t7Bookings = await prisma.hotelBooking.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { gte: t7Window.from, lt: t7Window.to },
    },
    include: {
      guest: true,
      property: true,
    },
  });

  for (const booking of t7Bookings) {
    const dupe = await alreadyDispatchedInLast14d(
      booking.guestId,
      booking.id,
      'UPSELL_REMINDER_T7',
      now,
    );
    if (dupe) {
      counts.skipped += 1;
      continue;
    }
    try {
      await sendMessage({
        kind: 'UPSELL_REMINDER_T7',
        templateId: upsellReminderT7Template.id,
        to: booking.guest.email,
        guestId: booking.guestId,
        bookingId: booking.id,
        vars: {
          firstName: booking.guest.firstName,
          propertyName: booking.property.name,
          checkInDate: formatCheckInDate(booking.checkIn),
          hubUrl: `${siteUrl}/hub`,
        },
      });
      counts.t7Dispatched += 1;
    } catch (err) {
      // sendMessage already swallows send failures; an unexpected throw here
      // means the MessageLog insert itself failed. Don't let one guest kill
      // the whole run — keep going.
      Sentry.captureException(err, {
        tags: { path: 'cron/pre-arrival/t7', bookingId: booking.id },
      });
    }
  }

  // ─── T-3 insurance reminder ─────────────────────────────────────────────
  const t3Bookings = await prisma.hotelBooking.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { gte: t3Window.from, lt: t3Window.to },
      guest: {
        insurancePolicies: { none: { status: 'ACTIVE' } },
      },
    },
    include: { guest: true, property: true },
  });

  for (const booking of t3Bookings) {
    const dupe = await alreadyDispatchedInLast14d(
      booking.guestId,
      booking.id,
      'INSURANCE_REMINDER_T3',
      now,
    );
    if (dupe) {
      counts.skipped += 1;
      continue;
    }
    try {
      await sendMessage({
        kind: 'INSURANCE_REMINDER_T3',
        templateId: insuranceReminderT3Template.id,
        to: booking.guest.email,
        guestId: booking.guestId,
        bookingId: booking.id,
        vars: {
          firstName: booking.guest.firstName,
          propertyName: booking.property.name,
          checkInDate: formatCheckInDate(booking.checkIn),
          offerUrl: `${siteUrl}/hub`,
        },
      });
      counts.t3Dispatched += 1;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { path: 'cron/pre-arrival/t3', bookingId: booking.id },
      });
    }
  }

  // ─── T-3 pre-arrival SMS ─────────────────────────────────────────────────
  // Same T-3 window as the insurance reminder. Independent of insurance
  // state — every confirmed booking with a phone gets the chat-hook SMS.
  const smsBookings = await prisma.hotelBooking.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { gte: t3Window.from, lt: t3Window.to },
      guest: { phone: { not: null } },
    },
    include: { guest: true, property: true },
  });

  for (const booking of smsBookings) {
    if (!booking.guest.phone) {
      counts.skipped += 1;
      continue;
    }
    const dupe = await alreadyDispatchedInLast14d(
      booking.guestId,
      booking.id,
      'PRE_ARRIVAL_SMS',
      now,
    );
    if (dupe) {
      counts.skipped += 1;
      continue;
    }
    try {
      // Conversation row created lazily here so the chat-token resolver at
      // /c/[token] always finds it.
      const conv = await getOrCreateConversation(booking.id);
      const chatToken = await mintChatToken({
        bookingId: booking.id,
        conversationId: conv.id,
      });
      const deepLink = `${siteUrl}/c/${chatToken}`;
      await sendSms({
        kind: 'PRE_ARRIVAL_SMS',
        template: preArrivalSmsTemplate,
        to: booking.guest.phone,
        guestId: booking.guestId,
        bookingId: booking.id,
        vars: {
          firstName: booking.guest.firstName,
          propertyName: booking.property.name,
          daysUntilCheckIn: 3,
          deepLink,
        },
      });
      counts.smsDispatched += 1;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { path: 'cron/pre-arrival/sms', bookingId: booking.id },
      });
    }
  }

  // ─── T-0 WELCOME_TO_RESORT notification ──────────────────────────────────
  // No comms — bell-dropdown notification only.
  const t0Bookings = await prisma.hotelBooking.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { gte: t0Window.from, lt: t0Window.to },
    },
    include: { guest: true, property: true },
  });
  for (const booking of t0Bookings) {
    try {
      const created = await createWelcomeToResortNotification({
        hotelBooking: booking,
      });
      if (created) counts.welcomeNotifications += 1;
      else counts.skipped += 1;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { path: 'cron/pre-arrival/welcome', bookingId: booking.id },
      });
    }
  }

  return NextResponse.json({ ok: true, ...counts });
}
