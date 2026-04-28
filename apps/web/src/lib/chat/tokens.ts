/**
 * Chat-surface token mint/verify (Sprint-6 completion §3.S6-05).
 *
 * Two token shapes share `KONCIE_CHAT_TOKEN_SECRET` and the same `jose`
 * HS256 mint/verify code path:
 *
 *  - **chat token** — minted by the pre-arrival SMS dispatcher, lands at
 *    `/c/[token]`. No `origin`. Resolves `(bookingId, conversationId)` and
 *    creates a chat-scoped session.
 *  - **bridge token** — minted by EmbeddedRegisterCard at register-trigger
 *    time, embedded as `?bt=…` on the Supabase OTP redirect URL, consumed at
 *    `/auth/callback`. Carries `origin.originCardKind` and
 *    `origin.originModalState` so the post-auth landing handler can rehydrate
 *    the originating modal.
 *
 * The `/c/[token]` route ignores `origin` even when present — that field is
 * a property of the bridge-token flow, not the chat surface (see completion
 * brief §8 risk-mitigation: "bridge-token leakage into the chat-token code
 * path"). Tests assert this.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

export type OriginCardKind = 'flight' | 'transfer' | 'activity' | 'dining';

export type ChatTokenOrigin = {
  originCardKind: OriginCardKind;
  originModalState: Record<string, unknown>;
};

export type ChatTokenPayload = {
  bookingId: string;
  conversationId: string;
  origin?: ChatTokenOrigin;
};

export class ChatTokenError extends Error {
  constructor(
    public readonly reason: 'invalid_signature' | 'expired' | 'malformed',
  ) {
    super(reason);
  }
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const raw = process.env.KONCIE_CHAT_TOKEN_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'KONCIE_CHAT_TOKEN_SECRET must be set and at least 32 chars',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function mintChatToken(input: {
  bookingId: string;
  conversationId: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    bookingId: input.bookingId,
    conversationId: input.conversationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + (input.expiresInSeconds ?? DEFAULT_TTL_SECONDS))
    .sign(getSecret());
}

export async function mintBridgeToken(input: {
  bookingId: string;
  conversationId: string;
  origin: ChatTokenOrigin;
  expiresInSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    bookingId: input.bookingId,
    conversationId: input.conversationId,
    origin: input.origin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(
      now + (input.expiresInSeconds ?? 60 * 60 * 24), // bridge tokens are 24h — they only need to survive an inbox round-trip.
    )
    .sign(getSecret());
}

export async function verifyChatToken(
  token: string,
): Promise<ChatTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const raw = payload as Record<string, unknown>;
    const { bookingId, conversationId, origin } = raw;
    if (typeof bookingId !== 'string' || typeof conversationId !== 'string') {
      throw new ChatTokenError('malformed');
    }
    let parsedOrigin: ChatTokenOrigin | undefined;
    if (origin && typeof origin === 'object') {
      const o = origin as Record<string, unknown>;
      const kind = o.originCardKind;
      const state = o.originModalState;
      if (
        typeof kind === 'string' &&
        ['flight', 'transfer', 'activity', 'dining'].includes(kind) &&
        state &&
        typeof state === 'object'
      ) {
        parsedOrigin = {
          originCardKind: kind as OriginCardKind,
          originModalState: state as Record<string, unknown>,
        };
      }
      // Unknown origin shape → silently drop. The post-auth handler falls
      // back to /hub when origin is absent or unrecognised (S6-05 AC).
    }
    return {
      bookingId,
      conversationId,
      ...(parsedOrigin ? { origin: parsedOrigin } : {}),
    };
  } catch (e) {
    if (e instanceof ChatTokenError) throw e;
    if (e instanceof joseErrors.JWTExpired) throw new ChatTokenError('expired');
    if (
      e instanceof joseErrors.JWSSignatureVerificationFailed ||
      e instanceof joseErrors.JWSInvalid
    ) {
      throw new ChatTokenError('invalid_signature');
    }
    throw new ChatTokenError('malformed');
  }
}
