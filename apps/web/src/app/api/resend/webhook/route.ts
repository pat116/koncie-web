/**
 * Resend webhook endpoint. Receives svix-signed delivery status events and
 * threads them back onto MessageLog rows by `providerMessageId`.
 *
 * Events we handle:
 *  - email.sent           → no-op (sendMessage already set SENT)
 *  - email.delivered      → DELIVERED + deliveredAt
 *  - email.bounced        → BOUNCED + failureReason
 *  - email.complained     → COMPLAINED
 *  - email.delivery_delayed → metadata.delayedAt written; status untouched
 *  - unknown              → Sentry breadcrumb + 200 (prevent Resend retries)
 *
 * Security: signature is verified against RESEND_WEBHOOK_SECRET (the
 * `whsec_…` value Pat sets in the Resend dashboard → Webhooks). We read the
 * raw body once, verify, then parse. 400 on bad signature; 500 on DB error
 * (Resend will retry a 5xx).
 */

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { verifySvixSignature } from '@/lib/messaging/svix-verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ResendEvent = {
  type: string;
  data?: {
    email_id?: string;
    // email.bounced payload carries a `bounce` object in Resend v2 events.
    bounce?: { reason?: string; type?: string; message?: string };
    // email.delivery_delayed carries a `delayed` timestamp-ish field.
    delayed_at?: string;
  };
};

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage('RESEND_WEBHOOK_SECRET not configured', 'error');
    return NextResponse.json(
      { ok: false, error: 'webhook_secret_missing' },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const verification = verifySvixSignature({
    secret,
    body: rawBody,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    svixSignature: request.headers.get('svix-signature'),
  });
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.reason },
      { status: 400 },
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    );
  }

  const providerMessageId = event.data?.email_id;
  if (!providerMessageId) {
    Sentry.addBreadcrumb({
      category: 'resend.webhook',
      level: 'warning',
      message: `Event ${event.type} missing email_id`,
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    const log = await prisma.messageLog.findUnique({
      where: { providerMessageId },
      select: { id: true },
    });
    if (!log) {
      // Not-our-row — event probably fired before sendMessage wrote the
      // providerMessageId, or it's for a seed/test row. No-op + 200.
      Sentry.addBreadcrumb({
        category: 'resend.webhook',
        level: 'info',
        message: `No MessageLog for ${providerMessageId}`,
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    switch (event.type) {
      case 'email.sent':
        // sendMessage already set SENT synchronously. No-op here.
        break;
      case 'email.delivered':
        await prisma.messageLog.update({
          where: { id: log.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        break;
      case 'email.bounced':
        await prisma.messageLog.update({
          where: { id: log.id },
          data: {
            status: 'BOUNCED',
            failureReason:
              event.data?.bounce?.message ??
              event.data?.bounce?.reason ??
              'bounced',
          },
        });
        break;
      case 'email.complained':
        await prisma.messageLog.update({
          where: { id: log.id },
          data: { status: 'COMPLAINED' },
        });
        break;
      case 'email.delivery_delayed': {
        const existing = await prisma.messageLog.findUniqueOrThrow({
          where: { id: log.id },
          select: { metadata: true },
        });
        const metadata = {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          delayedAt: event.data?.delayed_at ?? new Date().toISOString(),
        };
        await prisma.messageLog.update({
          where: { id: log.id },
          data: { metadata: metadata as object },
        });
        break;
      }
      default:
        Sentry.addBreadcrumb({
          category: 'resend.webhook',
          level: 'info',
          message: `Unhandled event ${event.type}`,
        });
    }

    return NextResponse.json({ ok: true, matched: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { path: 'resend.webhook', eventType: event.type },
    });
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
}
