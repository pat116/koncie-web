import { describe, it, expect, beforeEach } from 'vitest';
import {
  mintChatToken,
  mintBridgeToken,
  verifyChatToken,
  ChatTokenError,
} from '../tokens';

const SECRET = 'unit-test-chat-token-secret-must-be-32-chars-or-more';

beforeEach(() => {
  process.env.KONCIE_CHAT_TOKEN_SECRET = SECRET;
});

describe('mintChatToken / verifyChatToken', () => {
  it('round-trips bookingId + conversationId on a chat token (no origin)', async () => {
    const token = await mintChatToken({
      bookingId: 'b1',
      conversationId: 'c1',
    });
    const payload = await verifyChatToken(token);
    expect(payload.bookingId).toBe('b1');
    expect(payload.conversationId).toBe('c1');
    expect(payload.origin).toBeUndefined();
  });

  it('rejects a tampered signature with invalid_signature', async () => {
    const token = await mintChatToken({
      bookingId: 'b1',
      conversationId: 'c1',
    });
    const parts = token.split('.');
    // Flip the FIRST char of the signature — guaranteed to change bytes.
    const sig = parts[2]!;
    const swap: Record<string, string> = { A: 'B', B: 'A', a: 'b', b: 'a' };
    const head = sig[0]!;
    const replacement = swap[head] ?? (head === 'X' ? 'Y' : 'X');
    parts[2] = replacement + sig.slice(1);
    const tampered = parts.join('.');
    await expect(verifyChatToken(tampered)).rejects.toBeInstanceOf(ChatTokenError);
    await expect(verifyChatToken(tampered)).rejects.toMatchObject({
      reason: 'invalid_signature',
    });
  });

  it('rejects an expired token with expired', async () => {
    const token = await mintChatToken({
      bookingId: 'b1',
      conversationId: 'c1',
      expiresInSeconds: -10, // already expired
    });
    await expect(verifyChatToken(token)).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('treats malformed JWT as malformed', async () => {
    await expect(verifyChatToken('not-a-jwt')).rejects.toMatchObject({
      reason: 'invalid_signature', // jose treats this as JWSInvalid
    });
  });
});

describe('mintBridgeToken / verifyChatToken', () => {
  it('round-trips origin payload', async () => {
    const token = await mintBridgeToken({
      bookingId: 'b1',
      conversationId: 'c1',
      origin: {
        originCardKind: 'activity',
        originModalState: { upsellId: 'u9', step: 2, scheduledAt: '2026-07-15T10:00Z' },
      },
    });
    const payload = await verifyChatToken(token);
    expect(payload.bookingId).toBe('b1');
    expect(payload.origin).toEqual({
      originCardKind: 'activity',
      originModalState: { upsellId: 'u9', step: 2, scheduledAt: '2026-07-15T10:00Z' },
    });
  });

  it('drops unknown origin_card_kind silently (post-auth falls back to /hub)', async () => {
    // Hand-mint with a bogus card kind by going through SignJWT directly.
    const { SignJWT } = await import('jose');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      bookingId: 'b1',
      conversationId: 'c1',
      origin: { originCardKind: 'wormhole', originModalState: {} },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(new TextEncoder().encode(SECRET));

    const payload = await verifyChatToken(token);
    expect(payload.origin).toBeUndefined();
    expect(payload.bookingId).toBe('b1');
  });
});

describe('mintChatToken secret guard', () => {
  it('throws when KONCIE_CHAT_TOKEN_SECRET is missing or too short', async () => {
    delete process.env.KONCIE_CHAT_TOKEN_SECRET;
    await expect(
      mintChatToken({ bookingId: 'b1', conversationId: 'c1' }),
    ).rejects.toThrow(/KONCIE_CHAT_TOKEN_SECRET/);

    process.env.KONCIE_CHAT_TOKEN_SECRET = 'too-short';
    await expect(
      mintChatToken({ bookingId: 'b1', conversationId: 'c1' }),
    ).rejects.toThrow(/at least 32/);
  });
});
