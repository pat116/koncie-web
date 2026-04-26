'use server';

/**
 * Server actions for the /c/[token] chat surface (Sprint-6 completion
 * §3.S6-06/07).
 *
 *   - sendChatMessage: appends the guest's message + the AI canned reply,
 *     gated by chat-token verification. The token round-trip — rather than
 *     trusting the cookie alone — keeps the action robust if the cookie is
 *     stripped (e.g. cross-origin client).
 *
 *   - triggerRegisterMagicLink: mints a bridge token (with origin payload),
 *     embeds it as `?bt=…` on the Supabase OTP redirect URL, fires the
 *     OTP send. Logs a MAGIC_LINK MessageLog row. The follow-up landing at
 *     /auth/callback unpacks `bt`, verifies the bridge token, and routes
 *     into the originating modal.
 */

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import {
  verifyChatToken,
  mintBridgeToken,
  type OriginCardKind,
  type ChatTokenOrigin,
} from '@/lib/chat/tokens';
import { appendMessage } from '@/lib/chat/store';
import { resolveCannedReply } from '@/lib/chat/canned';
import { readChatSessionCookie } from '@/lib/chat/session';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { magicLinkTemplate } from '@/lib/messaging/templates/magic-link';

export type SendChatMessageResult =
  | { ok: true; aiMatched: boolean }
  | { ok: false; reason: 'invalid_token' | 'too_long' | 'unauthorized' };

export async function sendChatMessage(input: {
  token: string;
  body: string;
}): Promise<SendChatMessageResult> {
  const trimmed = input.body.trim();
  if (!trimmed) return { ok: false, reason: 'too_long' };
  if (trimmed.length > 1000) return { ok: false, reason: 'too_long' };

  let payload;
  try {
    payload = await verifyChatToken(input.token);
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }

  const session = await readChatSessionCookie();
  if (!session || session.conversationId !== payload.conversationId) {
    // Cookie missing or scoped to a different conversation — treat as
    // unauthorized; the next /c/[token] page render will set it correctly.
    return { ok: false, reason: 'unauthorized' };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: { guest: true, property: true },
  });
  if (!booking) return { ok: false, reason: 'invalid_token' };

  await appendMessage({
    conversationId: payload.conversationId,
    sender: 'guest',
    body: trimmed,
  });

  const reply = resolveCannedReply({
    guestMessage: trimmed,
    firstName: booking.guest.firstName,
    propertyName: booking.property.name,
  });
  await appendMessage({
    conversationId: payload.conversationId,
    sender: 'ai',
    body: reply.body,
    attachments: reply.attachments,
  });

  revalidatePath(`/c/${input.token}`);
  return { ok: true, aiMatched: reply.matched };
}

export type TriggerRegisterResult =
  | { ok: true; messageLogId: string }
  | { ok: false; reason: 'unauthorized' | 'send_failed'; detail?: string };

export async function triggerRegisterMagicLink(input: {
  reason: string;
  originCardKind: OriginCardKind;
  originModalState: Record<string, unknown>;
}): Promise<TriggerRegisterResult> {
  const session = await readChatSessionCookie();
  if (!session) return { ok: false, reason: 'unauthorized' };

  const booking = await prisma.booking.findUnique({
    where: { id: session.bookingId },
    include: { guest: true, property: true },
  });
  if (!booking) return { ok: false, reason: 'unauthorized' };

  const origin: ChatTokenOrigin = {
    originCardKind: input.originCardKind,
    originModalState: { ...input.originModalState, reason: input.reason },
  };
  const bridgeToken = await mintBridgeToken({
    bookingId: booking.id,
    conversationId: session.conversationId,
    origin,
  });

  // Site URL resolution mirrors fireMagicLinkForBooking: prefer the
  // branch alias on previews so PKCE cookies don't get stripped.
  const siteUrl =
    process.env.VERCEL_ENV !== 'production'
      ? process.env.VERCEL_BRANCH_URL
        ? `https://${process.env.VERCEL_BRANCH_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'
      : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
  const redirectTo = `${siteUrl}/auth/callback?bt=${encodeURIComponent(bridgeToken)}`;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: booking.guest.email,
    options: { emailRedirectTo: redirectTo },
  });

  const subject = magicLinkTemplate.subject({
    firstName: booking.guest.firstName,
    propertyName: booking.property.name,
    magicLinkUrl: '',
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { path: 'triggerRegisterMagicLink', bookingId: booking.id },
    });
    const failed = await prisma.messageLog.create({
      data: {
        guestId: booking.guestId,
        bookingId: booking.id,
        kind: 'MAGIC_LINK',
        templateId: magicLinkTemplate.id,
        recipientEmail: booking.guest.email,
        subject,
        status: 'FAILED',
        failureReason: error.message,
        metadata: {
          transport: 'supabase_otp',
          originCardKind: input.originCardKind,
          hasOriginModalState: true,
          bridgeToken: true,
          reason: input.reason,
        } as object,
      },
    });
    return { ok: false, reason: 'send_failed', detail: error.message };
    void failed;
  }

  const log = await prisma.messageLog.create({
    data: {
      guestId: booking.guestId,
      bookingId: booking.id,
      kind: 'MAGIC_LINK',
      templateId: magicLinkTemplate.id,
      recipientEmail: booking.guest.email,
      subject,
      status: 'SENT',
      sentAt: new Date(),
      metadata: {
        transport: 'supabase_otp',
        originCardKind: input.originCardKind,
        hasOriginModalState: true,
        bridgeToken: true,
        reason: input.reason,
      } as object,
    },
  });
  return { ok: true, messageLogId: log.id };
}
