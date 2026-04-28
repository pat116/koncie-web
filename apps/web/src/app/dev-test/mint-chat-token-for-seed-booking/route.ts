/**
 * Dev + CI-only helper: mints a chat token for the seed guest's first
 * booking and returns `{ token, url }`. Used by the Playwright spec at
 * `tests/e2e/chat-token.spec.ts`.
 *
 * Guard mirrors the other __test__ routes — refuses on Vercel production
 * unless `KONCIE_ENABLE_TEST_ROUTES=1`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { mintChatToken } from '@/lib/chat/tokens';
import { getOrCreateConversation } from '@/lib/chat/store';

export const dynamic = 'force-dynamic';

function isAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.KONCIE_ENABLE_TEST_ROUTES === '1';
}

export async function GET(request: NextRequest) {
  if (!isAllowed()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const seedEmail = process.env.KONCIE_SEED_EMAIL ?? 'pat@kovena.com';
  const guest = await prisma.guest.findUnique({
    where: { email: seedEmail },
    include: {
      bookings: { orderBy: { checkIn: 'asc' }, take: 1 },
    },
  });
  if (!guest || guest.bookings.length === 0) {
    return new NextResponse(
      `No booking for seed guest ${seedEmail} — run pnpm db:seed first`,
      { status: 404 },
    );
  }

  const booking = guest.bookings[0]!;
  const conv = await getOrCreateConversation(booking.id);
  const token = await mintChatToken({
    bookingId: booking.id,
    conversationId: conv.id,
  });
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    token,
    url: `${origin}/c/${token}`,
    bookingId: booking.id,
    conversationId: conv.id,
  });
}
