/**
 * Recompute Trip phase cron (S7-10).
 *
 * Invoked daily at 03:00 UTC by Vercel Cron. Walks Trips whose
 * `phaseComputedAt` is older than `endDate` OR older than 1 hour AND a
 * phase boundary has elapsed since (cheap query — index on `phase`).
 *
 * Sprint 7 ships the writer + cron. Cart-mutation hooks land in Sprint 8
 * — the recompute pathway is in place; what changes is the trigger
 * point. Cron is the safety-net even when hooks fire correctly.
 *
 * Idempotency: `recomputeTrip` is a no-op when stored values match, so
 * re-running this within the same minute does no extra writes.
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { recomputeTrip } from '@/lib/trip/recompute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PER_TICK_BUDGET = 200;
const ONE_HOUR_MS = 60 * 60 * 1000;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);

  // Stale set: Trips whose phaseComputedAt is older than 1 hour AND whose
  // endDate has not yet been crossed (phase can still flip). Limit per-tick
  // by recompute cost — 200 trips × ~1ms compute = 200ms, comfortable.
  const stale = await prisma.trip.findMany({
    where: {
      phaseComputedAt: { lt: oneHourAgo },
      endDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) },
    },
    select: { id: true },
    take: PER_TICK_BUDGET,
  });

  let recomputed = 0;
  let unchanged = 0;
  let errors = 0;
  for (const { id } of stale) {
    try {
      const result = await recomputeTrip(id, { now });
      if (result.changed) recomputed += 1;
      else unchanged += 1;
    } catch (err) {
      errors += 1;
      Sentry.captureException(err, {
        tags: { path: 'cron/recompute-trip-phase', tripId: id },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    recomputed,
    unchanged,
    errors,
    perTickBudget: PER_TICK_BUDGET,
  });
}
