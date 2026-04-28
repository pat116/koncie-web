/**
 * JetSeeker time-change webhook (Sprint-6 completion §3.S6-08).
 *
 *  - Verify HMAC signature against `KONCIE_JETSEEKER_WEBHOOK_SECRET`.
 *  - Bad sig → 401. Bad shape → 400. Unknown booking → 202 (queued; let
 *    JetSeeker stop retrying).
 *  - Idempotent on (jetseeker_order_id, occurred_at) at the notification
 *    layer.
 *
 * Sprint-6 scope: scaffold only. Live emitter wires up in Sprint-7 broader
 * data-model push, when the Symfony team confirms the contract specifics.
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import {
  applyJetSeekerTimeChange,
  timeChangePayloadSchema,
  verifyJetSeekerSignature,
} from '@/lib/jetseeker/timeChange';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.KONCIE_JETSEEKER_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage(
      'KONCIE_JETSEEKER_WEBHOOK_SECRET not configured',
      'error',
    );
    return NextResponse.json(
      { ok: false, error: 'webhook_secret_missing' },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const sig = request.headers.get('x-jetseeker-signature');
  if (!verifyJetSeekerSignature({ rawBody, signatureHeader: sig, secret })) {
    return NextResponse.json(
      { ok: false, error: 'invalid_signature' },
      { status: 401 },
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const validation = timeChangePayloadSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: 'malformed_payload' },
      { status: 400 },
    );
  }

  try {
    const outcome = await applyJetSeekerTimeChange(validation.data);
    if (outcome.kind === 'queued') {
      // 202 — JetSeeker should treat this as accepted (not an error to
      // retry). Sprint-7 wire-up will introduce a real retry queue.
      return NextResponse.json(
        { ok: true, outcome: 'queued' },
        { status: 202 },
      );
    }
    return NextResponse.json({
      ok: true,
      outcome: 'notified',
      created: outcome.notificationCreated,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { path: 'webhooks.jetseeker.time-change' } });
    return NextResponse.json(
      { ok: false, error: 'processing_error' },
      { status: 500 },
    );
  }
}
