import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    guest: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Import after mock setup
const { linkGuestToAuthUser } = await import('./guest-linking');

describe('linkGuestToAuthUser', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('sets auth_user_id and claimedAt on first link', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'g1',
      authUserId: null,
      claimedAt: null,
    });
    mockUpdate.mockResolvedValueOnce({
      id: 'g1',
      email: 'jane@example.com',
      authUserId: 'auth-1',
      claimedAt: new Date(),
    });

    await linkGuestToAuthUser({
      email: 'jane@example.com',
      authUserId: 'auth-1',
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const call = mockUpdate.mock.calls[0]![0] as {
      where: { email: string };
      data: { authUserId: string; claimedAt: Date };
    };
    expect(call.where.email).toBe('jane@example.com');
    expect(call.data.authUserId).toBe('auth-1');
    expect(call.data.claimedAt).toBeInstanceOf(Date);
  });

  it('preserves existing claimedAt when re-linking same guest', async () => {
    const originalClaim = new Date('2026-04-23T10:00:00Z');
    mockFindUnique.mockResolvedValueOnce({
      id: 'g1',
      authUserId: 'auth-1',
      claimedAt: originalClaim,
    });
    mockUpdate.mockResolvedValueOnce({
      id: 'g1',
      email: 'jane@example.com',
      authUserId: 'auth-1',
      claimedAt: originalClaim,
    });

    await linkGuestToAuthUser({
      email: 'jane@example.com',
      authUserId: 'auth-1',
    });

    const call = mockUpdate.mock.calls[0]![0] as {
      data: { claimedAt: Date };
    };
    expect(call.data.claimedAt).toBe(originalClaim);
  });

  it('throws when no Guest row exists for the email', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      linkGuestToAuthUser({
        email: 'unknown@example.com',
        authUserId: 'auth-1',
      }),
    ).rejects.toThrow('No Guest row for email unknown@example.com');

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
