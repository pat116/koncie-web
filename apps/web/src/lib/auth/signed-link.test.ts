import { describe, it, expect, beforeAll } from 'vitest';
import { signMagicLink, verifyMagicLink } from './signed-link';
import { SignedLinkError } from '@/lib/errors';

beforeAll(() => {
  process.env.KONCIE_SIGNED_LINK_SECRET =
    'test-secret-at-least-32-chars-long-xxxxxx';
});

describe('signed-link JWT', () => {
  it('round-trips a valid payload', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });

    const payload = await verifyMagicLink(token);
    expect(payload.bookingId).toBe('00000000-0000-0000-0000-000000000001');
    expect(payload.guestEmail).toBe('jane@example.com');
  });

  it('rejects a tampered signature', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });
    const tampered = token.slice(0, -4) + 'abcd';

    await expect(verifyMagicLink(tampered)).rejects.toThrow(SignedLinkError);
  });

  it('rejects an expired token', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: -1, // already expired
    });

    await expect(verifyMagicLink(token)).rejects.toThrow(SignedLinkError);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });

    process.env.KONCIE_SIGNED_LINK_SECRET =
      'different-secret-at-least-32-chars-yyyyyy';
    await expect(verifyMagicLink(token)).rejects.toThrow(SignedLinkError);
    process.env.KONCIE_SIGNED_LINK_SECRET =
      'test-secret-at-least-32-chars-long-xxxxxx';
  });
});
