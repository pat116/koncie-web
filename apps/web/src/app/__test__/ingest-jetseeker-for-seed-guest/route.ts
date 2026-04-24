/**
 * Dev + CI-only helper: triggers syncFlightsForGuest for the seeded guest and
 * redirects to /hub. Playwright + manual demos use this to bypass the 60-second
 * lazy-sync debounce. Guard matches Sprint 2-polish's sign-in-as-seed-guest
 * route.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncFlightsForGuest } from '@/lib/flights/sync';

export const dynamic = 'force-dynamic';

function isAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.KONCIE_ENABLE_TEST_ROUTES === '1';
}

export async function GET(request: NextRequest) {
  if (!isAllowed()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const seedEmail = process.env.KONCIE_SEED_EMAIL;
  if (!seedEmail) {
    return new NextResponse('KONCIE_SEED_EMAIL not set', { status: 500 });
  }

  const guest = await prisma.guest.findUnique({ where: { email: seedEmail } });
  if (!guest) {
    return new NextResponse(`Seed guest ${seedEmail} not found — run pnpm db:seed first`, {
      status: 404,
    });
  }

  try {
    await syncFlightsForGuest(guest.id);
  } catch (err) {
    return new NextResponse(`Sync failed: ${(err as Error).message}`, { status: 502 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/hub`, { status: 303 });
}
