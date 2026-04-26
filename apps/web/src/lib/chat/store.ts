/**
 * Conversation + ChatMessage persistence (Sprint-6 completion §3.S6-07).
 *
 * SEPARATE from MessageLog. MessageLog = outbound delivery audit (what we
 * sent, delivery status). Conversation/ChatMessage = guest-thread
 * persistence (what was said in the chat surface). Neither imports the
 * other; risk-mitigation §8 of the completion brief locks this.
 *
 * - `getOrCreateConversation(bookingId)` — idempotent. Called by the SMS
 *   dispatcher at trigger time so the chat-token resolver always finds an
 *   existing record.
 * - `appendMessage(...)` — record one chat message (guest or AI).
 * - `getMessages(conversationId, { limit })` — read for the chat surface.
 * - `markGreetingSent(conversationId)` — one-shot gate for AI greeting
 *   re-injection on every /c/[token] resolution.
 */

import { prisma } from '@/lib/db/prisma';

export type ChatMessageAttachment =
  | { kind: 'download_card' }
  | { kind: 'register_cta'; reason: string };

export type AppendChatMessageInput = {
  conversationId: string;
  sender: 'guest' | 'ai';
  body: string;
  attachments?: ChatMessageAttachment[];
};

export async function getOrCreateConversation(
  bookingId: string,
): Promise<{
  id: string;
  bookingId: string;
  greetingSentAt: Date | null;
}> {
  const existing = await prisma.conversation.findUnique({
    where: { bookingId },
    select: { id: true, bookingId: true, greetingSentAt: true },
  });
  if (existing) return existing;
  const created = await prisma.conversation.create({
    data: { bookingId },
    select: { id: true, bookingId: true, greetingSentAt: true },
  });
  return created;
}

export async function appendMessage(input: AppendChatMessageInput) {
  return prisma.chatMessage.create({
    data: {
      conversationId: input.conversationId,
      sender: input.sender,
      body: input.body,
      attachments: (input.attachments ?? []) as object,
    },
  });
}

export async function getMessages(
  conversationId: string,
  options?: { limit?: number },
) {
  const limit = options?.limit ?? 50;
  return prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { sentAt: 'asc' },
    take: limit,
  });
}

export async function markGreetingSent(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { greetingSentAt: new Date() },
  });
}
