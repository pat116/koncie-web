/**
 * Chat-scoped session cookie helpers (Sprint-6 completion §3.S6-05).
 *
 * `koncie_chat_session` is HttpOnly, SameSite=Lax, scoped to /c/* — it
 * cannot authenticate against /hub, /admin, or any non-chat write API.
 * Limited-permission session.
 *
 * The cookie carries the resolved (bookingId, conversationId) pair so
 * server actions on the chat route can authorise message writes without
 * re-validating the JWT on every request.
 */

import { cookies } from 'next/headers';

export const CHAT_SESSION_COOKIE = 'koncie_chat_session';

const ONE_DAY_S = 60 * 60 * 24;
const THIRTY_DAYS_S = ONE_DAY_S * 30;

export type ChatSessionPayload = {
  bookingId: string;
  conversationId: string;
};

export async function setChatSessionCookie(
  payload: ChatSessionPayload,
): Promise<void> {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const jar = await cookies();
  jar.set({
    name: CHAT_SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax',
    path: '/c',
    secure: process.env.NODE_ENV === 'production',
    maxAge: THIRTY_DAYS_S,
  });
}

export async function readChatSessionCookie(): Promise<ChatSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(CHAT_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (
      typeof parsed.bookingId !== 'string' ||
      typeof parsed.conversationId !== 'string'
    ) {
      return null;
    }
    return {
      bookingId: parsed.bookingId,
      conversationId: parsed.conversationId,
    };
  } catch {
    return null;
  }
}
