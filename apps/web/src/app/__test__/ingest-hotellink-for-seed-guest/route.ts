/**
 * Dev + CI-only helper: runs ingestHotelLinkBooking for the seeded guest
 * without the HMAC signature dance, then redirects to /hub. Playwright
 * + manual demos use this to exercise the HotelLink ingest path end to
 * end without standing up a real signed webhook emitter. Guard matches
 * the Sprint 3 ingest-jetseeker-for-seed-guest pattern.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  ingestHotelLinkBooking,
  PropertyNotFoundError,
} from '@/lib/hotellink/ingest';
import { mockHotelLinkWebhookPayload } from '@/adapters/hotellink-mock';

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

  const payload = mockHotelLinkWebhookPayload({
    bookingRef: `HL-TEST-${Date.now()}`,
    propertySlug: 'namotu-island-fiji',
    guest: { email: seedEmail, firstName: 'Jane', lastName: 'Demo' },
    checkIn: '2026-08-04T00:00:00.000Z',
    checkOut: '2026-08-11T00:00:00.000Z',
    numGuests: 2,
    status: 'CONFIRMED',
  });

  try {
    await ingestHotelLinkBooking(payload);
  } catch (err) {
    if (err instanceof PropertyNotFoundError) {
      return new NextResponse(
        `Property "${err.slug}" not found — run pnpm db:seed first`,
        { status: 404 },
      );
    }
    return new NextResponse(`Ingest failed: ${(err as Error).message}`, {
      status: 502,
    });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/hub`, { status: 303 });
}
