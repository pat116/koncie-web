import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import type { MessageKind, MessageLog } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getTemplate } from './templates';

export type SendMessageInput = {
  kind: MessageKind;
  templateId: string;
  to: string;
  vars: unknown;
  guestId?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
};

export type SendMessageResult = {
  messageLog: MessageLog;
  delivered: boolean;
};

const FROM_ADDRESS =
  process.env.KONCIE_RESEND_FROM ?? 'Koncie <no-reply@koncie.app>';

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Koncie's single outbound-email entry point.
 *
 * Every call:
 *  1. Renders the template (subject + html + text).
 *  2. Inserts a MessageLog row at QUEUED.
 *  3. Hands off to Resend with a `message_log_id` tag so the webhook can
 *     thread delivery/bounce events back onto the row.
 *  4. On send success → updates the row to SENT with providerMessageId.
 *  5. On send failure → updates to FAILED with failureReason. The throw is
 *     swallowed (reported to Sentry) so a messaging outage doesn't break
 *     the upstream guest flow (e.g. payment capture).
 *
 * Returns the final MessageLog row and a `delivered` flag — `true` if
 * Resend accepted the send. Callers almost always ignore the return value;
 * it exists for tests and for future admin-side "resend" CTAs.
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const template = getTemplate(input.templateId);
  const subject = template.subject(input.vars);
  const rendered = await template.render(input.vars);

  const log = await prisma.messageLog.create({
    data: {
      guestId: input.guestId,
      bookingId: input.bookingId,
      kind: input.kind,
      templateId: input.templateId,
      recipientEmail: input.to,
      subject,
      status: 'QUEUED',
      metadata: (input.metadata ?? {}) as object,
    },
  });

  const resend = resendClient();
  if (!resend) {
    // No API key configured — common in CI/build with placeholder env. Record
    // as FAILED so the audit captures the gap without throwing upstream.
    const updated = await prisma.messageLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        failureReason: 'RESEND_API_KEY not configured',
      },
    });
    return { messageLog: updated, delivered: false };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [input.to],
      subject,
      html: rendered.html,
      text: rendered.text,
      tags: [{ name: 'message_log_id', value: log.id }],
    });

    if (error || !data?.id) {
      const updated = await prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          failureReason: error?.message ?? 'Resend returned no message id',
        },
      });
      Sentry.captureException(error ?? new Error('Resend send returned no id'), {
        tags: { messageLogId: log.id, templateId: input.templateId },
      });
      return { messageLog: updated, delivered: false };
    }

    const updated = await prisma.messageLog.update({
      where: { id: log.id },
      data: {
        status: 'SENT',
        providerMessageId: data.id,
        sentAt: new Date(),
      },
    });
    return { messageLog: updated, delivered: true };
  } catch (err) {
    const updated = await prisma.messageLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message : String(err),
      },
    });
    Sentry.captureException(err, {
      tags: { messageLogId: log.id, templateId: input.templateId },
    });
    return { messageLog: updated, delivered: false };
  }
}
