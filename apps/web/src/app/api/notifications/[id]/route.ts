/**
 * PATCH /api/notifications/:id — mark a notification read.
 * (Sprint-6 completion §3.S6-09.)
 *
 * Authorisation: the notification's booking must belong to the signed-in
 * guest. No body is required; the action is fixed (read=true). Idempotent.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { markNotificationRead } from '@/lib/notifications/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServerClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const guest = await prisma.guest.findUnique({
    where: { authUserId: userResult.user.id },
    select: { id: true },
  });
  if (!guest) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const notification = await prisma.notification.findUnique({
    where: { id },
    include: { hotelBooking: { select: { guestId: true } } },
  });
  if (!notification || notification.hotelBooking.guestId !== guest.id) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  await markNotificationRead(id);
  return NextResponse.json({ ok: true });
}
