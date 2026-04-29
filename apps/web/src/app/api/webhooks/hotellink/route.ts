/**
 * HotelLink webhook endpoint.
 *
 * Receives HMAC-SHA256 signed booking events from Kovena's HotelLink
 * emitter and funnels them into `ingestHotelLinkBooking`. Verification
 * happens on the raw body before JSON parsing so the signature covers
 * the exact bytes HotelLink signed.
 *
 * Response matrix (tuned for HotelLink's retry semantics):
 *   200  ok                    — ingest succeeded (or was idempotently skipped)
 *   400  missing/bad signature — emitter bug; no retry expected
 *   400  invalid_json          — payload malformed
 *   400  invalid_payload       — payload failed Zod validation
 *   404  property_not_found    — unknown propertySlug; HotelLink stops retrying
 *   500  ingest_failed         — anything else; HotelLink retries
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  ingestHotelLinkBooking,
  PropertyNotFoundError,
} from '@/lib/hotellink/ingest';
import { verifyHotelLinkSignature } from '@/lib/hotellink/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.HOTELLINK_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage('HOTELLINK_WEBHOOK_SECRET not configured', 'error');
    return NextResponse.json(
      { ok: false, reason: 'webhook_secret_missing' },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const verification = verifyHotelLinkSignature({
    secret,
    rawBody,
    signatureHeader: request.headers.get('x-hotellink-signature'),
    timestampHeader: request.headers.get('x-hotellink-timestamp'),
  });
  if (!verification.ok) {
    Sentry.addBreadcrumb({
      category: 'hotellink.webhook',
      level: 'warning',
      message: `Signature rejected: ${verification.reason}`,
    });
    return NextResponse.json(
      { ok: false, reason: verification.reason },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_json' },
      { status: 400 },
    );
  }

  try {
    const result = await ingestHotelLinkBooking(payload);
    return NextResponse.json({
      ok: true,
      bookingId: result.hotelBooking.id,
      messageLogId: result.messageLogId,
      skipped: result.skipped,
    });
  } catch (err) {
    if (err instanceof PropertyNotFoundError) {
      return NextResponse.json(
        { ok: false, reason: 'property_not_found' },
        { status: 404 },
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, reason: 'invalid_payload' },
        { status: 400 },
      );
    }
    Sentry.captureException(err, { tags: { path: 'hotellink.webhook' } });
    return NextResponse.json(
      { ok: false, reason: 'ingest_failed' },
      { status: 500 },
    );
  }
}
