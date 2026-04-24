/**
 * Pre-arrival comms cron — invoked daily by Vercel Cron at 02:00 UTC
 * (~midday Sydney). Scans for guests in the T-7 and T-3 windows and
 * dispatches the corresponding reminder template.
 *
 * Triggers:
 *  - `UPSELL_REMINDER_T7` — guests with a CONFIRMED booking whose checkIn is
 *    6d 12h..7d 12h out, who haven't been sent this kind in the last 14 days.
 *  - `INSURANCE_REMINDER_T3` — same window but 2d 12h..3d 12h, AND the guest
 *    has no ACTIVE insurance policy.
 *
 * Idempotency: the 14-day look-back MessageLog check means re-invoking the
 * cron within the same hour is a no-op for already-dispatched rows. Status
 * FAILED rows do count as "already dispatched" — we don't retry on this
 * path, so a messaging outage at send-time is logged but not retried the
 * next tick. That matches the pilot's hand-tuned posture.
 *
 * Auth: Vercel Cron injects `Authorization: Bearer <CRON_SECRET>`. We reject
 * anything else with 401 to prevent third parties triggering the endpoint.
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { sendMessage } from '@/lib/messaging/send';
import { upsellReminderT7Template } from '@/lib/messaging/templates/upsell-reminder-t7';
import { insuranceReminderT3Template } from '@/lib/messaging/templates/insurance-reminder-t3';

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
  // regardless of the time-of-day semantics of Booking.checkIn (stored as
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
  kind: 'UPSELL_REMINDER_T7' | 'INSURANCE_REMINDER_T3',
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

  const counts = {
    t7Dispatched: 0,
    t3Dispatched: 0,
    skipped: 0,
  };

  // ─── T-7 upsell reminder ────────────────────────────────────────────────
  const t7Bookings = await prisma.booking.findMany({
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
  const t3Bookings = await prisma.booking.findMany({
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

  return NextResponse.json({ ok: true, ...counts });
}
