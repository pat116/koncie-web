/**
 * Sprint 7 — Trip projection endpoint (S7-13).
 *
 * GET /api/trips/{slug}
 *
 * Auth via Supabase session cookie (existing pattern in apps/web/src/lib/auth).
 * Per spec doc §8.5: a slug is guessable, so we never return the full
 * TripView to a non-owner. Anonymous/non-owner gets a thin stub with
 * status 200 + body { exists: true, signInRequired: true }.
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildTripView } from '@/lib/trip/view';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { slug: string };
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { slug } = ctx.params;
  if (!slug || slug.length === 0) {
    return NextResponse.json({ ok: false, reason: 'invalid_slug' }, { status: 400 });
  }

  // Resolve current guest from Supabase session — null if anonymous.
  let authenticatedGuestId: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      const guest = await prisma.guest.findFirst({
        where: user.id
          ? { OR: [{ authUserId: user.id }, { email: user.email }] }
          : { email: user.email },
        select: { id: true },
      });
      authenticatedGuestId = guest?.id ?? null;
    }
  } catch (err) {
    // Auth resolution failures — log + treat as anonymous. The owner check
    // below will return the stub.
    Sentry.captureException(err, {
      tags: { path: 'api/trips/slug', step: 'resolve_user' },
    });
  }

  try {
    const view = await buildTripView({ slug, authenticatedGuestId });
    if (view === null) {
      return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(view, { status: 200 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { path: 'api/trips/slug', step: 'build_view', slug },
    });
    return NextResponse.json(
      { ok: false, reason: 'internal_error' },
      { status: 500 },
    );
  }
}
