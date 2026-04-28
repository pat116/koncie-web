/**
 * /c/[token] — public chat surface (Sprint-6 completion §3.S6-05/06/07).
 *
 * Token resolution:
 *   - valid → render chat surface, set chat-scoped session cookie
 *   - expired → "link expired" surface with mailto re-request CTA
 *   - tampered → 404 (no oracle on token validity)
 *
 * Greeting is gated by Conversation.greeting_sent_at — fired once on first
 * resolve, persisted as a single AI ChatMessage row (open question Q2 from
 * the completion brief, locked here as the recommendation).
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { verifyChatToken, ChatTokenError } from '@/lib/chat/tokens';
import {
  getOrCreateConversation,
  getMessages,
  appendMessage,
  markGreetingSent,
} from '@/lib/chat/store';
import { PhoneShell } from '@/components/chat/PhoneShell';
import { MessageList, type MessageView } from '@/components/chat/MessageList';
import { SuggestionChips } from '@/components/chat/SuggestionChips';
import { MessageInput } from '@/components/chat/MessageInput';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function expiredView() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-koncie-sand px-6 text-center">
      <h1 className="text-xl font-semibold text-koncie-navy">Link expired</h1>
      <p className="mt-2 text-sm text-koncie-charcoal/80">
        This concierge link has expired. Reply to your most recent Koncie SMS
        or email a fresh one.
      </p>
      <a
        href="mailto:concierge@koncie.app?subject=New%20concierge%20link"
        className="mt-4 inline-flex items-center rounded-full bg-koncie-navy px-4 py-2 text-sm font-semibold text-white"
      >
        Email concierge
      </a>
    </div>
  );
}

export default async function ChatTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let payload;
  try {
    payload = await verifyChatToken(token);
  } catch (e) {
    if (e instanceof ChatTokenError) {
      if (e.reason === 'expired') return expiredView();
      // invalid_signature / malformed → 404 (no token-validity oracle).
      notFound();
    }
    throw e;
  }

  // The chat surface intentionally IGNORES origin — that's bridge-token
  // territory. Tests assert this (completion brief §8 risk-mitigation).
  const { bookingId, conversationId } = payload;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { guest: true, property: true },
  });
  if (!booking) notFound();

  // Defensive: ensure the conversation row exists (the SMS dispatcher
  // creates it lazily, but we're a separate entry point too).
  const conv = await getOrCreateConversation(bookingId);
  if (conv.id !== conversationId) {
    // Token's conversationId doesn't match the conversation we found for
    // this booking. Treat as malformed — don't honour a stale token.
    notFound();
  }

  // Greeting injection — one-shot. Subsequent resolutions skip this branch.
  if (!conv.greetingSentAt) {
    const greeting =
      `Hi ${booking.guest.firstName}, welcome to your ${booking.property.name} ` +
      `concierge. Check-in ${fmtDate(booking.checkIn)} — ${fmtDate(booking.checkOut)}. ` +
      `Tap a suggestion below or type your own question.`;
    await appendMessage({
      conversationId: conv.id,
      sender: 'ai',
      body: greeting,
    });
    await markGreetingSent(conv.id);
  }

  // The chat-scoped session cookie is written by middleware
  // (apps/web/src/middleware.ts) — Server Components can't call
  // cookies().set(). The READ path (server actions) still goes through
  // readChatSessionCookie.

  const rows = await getMessages(conv.id, { limit: 50 });
  const messages: MessageView[] = rows.map((r) => ({
    id: r.id,
    sender: r.sender as 'guest' | 'ai',
    body: r.body,
    attachments: (r.attachments as MessageView['attachments']) ?? [],
    sentAt: r.sentAt,
  }));

  return (
    <PhoneShell propertyName={booking.property.name}>
      <div className="flex flex-1 flex-col overflow-y-auto pb-2">
        <MessageList
          messages={messages}
          context={{
            // Default register-from-chat origin. Bridge-token consumer
            // (auth callback) routes to /hub when it sees this generic
            // value or when it doesn't recognise origin_card_kind.
            defaultRegisterOrigin: {
              originCardKind: 'activity',
              originModalState: { source: 'chat-register-cta' },
            },
          }}
        />
      </div>
      <SuggestionChips token={token} />
      <MessageInput token={token} />
    </PhoneShell>
  );
}
