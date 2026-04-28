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
 *
 * The cookie is WRITTEN by middleware (`apps/web/src/middleware.ts`) on
 * each `/c/[token]` request — Server Components in Next.js 15+ throw if
 * they call `cookies().set(...)`. Middleware is the legal place to write.
 * The READ path (server actions, route handlers) still goes via
 * `readChatSessionCookie` below.
 */

import { cookies } from 'next/headers';

export const CHAT_SESSION_COOKIE = 'koncie_chat_session';

const ONE_DAY_S = 60 * 60 * 24;
export const CHAT_SESSION_MAX_AGE_S = ONE_DAY_S * 30;

export type ChatSessionPayload = {
  bookingId: string;
  conversationId: string;
};

/**
 * Pure encode helper. Safe to call from middleware (Edge runtime) — does
 * not import `next/headers`.
 */
export function encodeChatSessionValue(payload: ChatSessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Pure decode helper. Returns null on any parse failure.
 */
export function decodeChatSessionValue(
  raw: string | undefined | null,
): ChatSessionPayload | null {
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

/**
 * Read the cookie from the inbound request. Used by server actions and
 * route handlers — NOT from Server Components on the same render that
 * middleware just wrote it (cookie writes by middleware aren't visible
 * to the same request's downstream handler).
 */
export async function readChatSessionCookie(): Promise<ChatSessionPayload | null> {
  const jar = await cookies();
  return decodeChatSessionValue(jar.get(CHAT_SESSION_COOKIE)?.value);
}
