/**
 * Notifications API (Sprint-6 completion §3.S6-09).
 *
 *  - GET /api/notifications?bookingId=…   → last 20 notifications for a
 *    booking, sorted by createdAt DESC. Polled from the bell-dropdown
 *    (60s open / 5min idle, driven from the client).
 *
 *  - PATCH /api/notifications/:id        → set read=true. (Routed via
 *    [id] sub-route, handled separately.)
 *
 * Auth: the caller is the signed-in guest. We resolve the session via
 * `requireSignedInGuest()` and gate the booking lookup on the guest's own
 * bookings — no cross-guest reads. The endpoint is intentionally narrow:
 * one booking per request, no list-by-guest fan-out.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { listNotificationsForBooking } from '@/lib/notifications/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) {
    return NextResponse.json(
      { ok: false, error: 'missing_bookingId' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Verify the booking belongs to the signed-in guest.
  const guest = await prisma.guest.findUnique({
    where: { authUserId: userResult.user.id },
    select: { id: true },
  });
  if (!guest) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const booking = await prisma.hotelBooking.findFirst({
    where: { id: bookingId, guestId: guest.id },
    select: { id: true },
  });
  if (!booking) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const rows = await listNotificationsForBooking(bookingId);
  return NextResponse.json({
    ok: true,
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      inlineCta: r.inlineCta as { label: string; href: string } | null,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
