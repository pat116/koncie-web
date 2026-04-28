/**
 * Server slot that resolves the signed-in guest's first booking and
 * server-renders the BellDropdown with initial notifications. Renders
 * nothing when there's no auth session — safe to drop into the hub
 * layout, which is also rendered for /welcome bounce paths.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { listNotificationsForBooking } from '@/lib/notifications/service';
import { BellDropdown } from './BellDropdown';
import type { NotificationView } from './NotificationItem';

export async function BellSlot() {
  const supabase = createSupabaseServerClient();
  const { data: userResult } = await supabase.auth.getUser().catch(() => ({
    data: { user: null },
  }));
  if (!userResult?.user) return null;
  const guest = await prisma.guest.findFirst({
    where: userResult.user.id
      ? { OR: [{ authUserId: userResult.user.id }, { email: userResult.user.email ?? '' }] }
      : { email: userResult.user.email ?? '' },
    include: {
      bookings: { orderBy: { checkIn: 'asc' }, take: 1 },
    },
  });
  if (!guest || guest.bookings.length === 0) return null;
  const booking = guest.bookings[0]!;

  const rows = await listNotificationsForBooking(booking.id);
  const initial: NotificationView[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    inlineCta: r.inlineCta as { label: string; href: string } | null,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
  }));

  return <BellDropdown bookingId={booking.id} initialNotifications={initial} />;
}
