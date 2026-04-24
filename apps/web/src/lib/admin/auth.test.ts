/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose any-typed Prisma mocks — matches Sprint 3/4 policy.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` calls are hoisted to the top of the file — references captured
// inside the factory must be declared via `vi.hoisted()` so they initialize
// before the hoisted mock runs.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

import { requireAdmin } from './auth';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function wireSupabase(user: { id?: string; email?: string } | null) {
  (createSupabaseServerClient as any).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  });
}

const baseProperty = {
  id: 'prop-namotu',
  slug: 'namotu-island-fiji',
  name: 'Namotu Island Fiji',
  country: 'FJ',
  region: 'Fiji',
  timezone: 'Pacific/Fiji',
  partnerIntegrationId: 'partner-hotellink',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseAdmin = {
  id: 'admin-1',
  email: 'admin.namotu@koncie.app',
  propertyId: 'prop-namotu',
  role: 'HOTEL_ADMIN',
  authUserId: null,
  firstName: 'Namotu',
  lastName: 'Admin',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).adminUser = {
      findFirst: vi.fn(),
    };
  });

  it('returns admin + property when the signed-in email matches an AdminUser', async () => {
    wireSupabase({ id: 'user-1', email: 'admin.namotu@koncie.app' });
    (prisma as any).adminUser.findFirst.mockResolvedValue({
      ...baseAdmin,
      property: baseProperty,
    });

    const ctx = await requireAdmin();

    expect(ctx.admin.email).toBe('admin.namotu@koncie.app');
    expect(ctx.admin.role).toBe('HOTEL_ADMIN');
    expect(ctx.property.slug).toBe('namotu-island-fiji');
    // Verify OR-query shape matches the guest-auth helper.
    expect((prisma as any).adminUser.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { authUserId: 'user-1' },
          { email: 'admin.namotu@koncie.app' },
        ],
      },
      include: { property: true },
    });
  });

  it('redirects to /welcome when Supabase returns no user', async () => {
    wireSupabase(null);

    await expect(requireAdmin()).rejects.toThrow(
      'REDIRECT:/welcome?error=admin_unauthenticated',
    );
    expect((prisma as any).adminUser.findFirst).not.toHaveBeenCalled();
  });

  it('redirects when user has an email but no AdminUser row', async () => {
    wireSupabase({ id: 'user-guest', email: 'guest@example.com' });
    (prisma as any).adminUser.findFirst.mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toThrow(
      'REDIRECT:/welcome?error=not_an_admin',
    );
  });

  it('falls back to email-only lookup when Supabase user has no id', async () => {
    wireSupabase({ email: 'admin.namotu@koncie.app' });
    (prisma as any).adminUser.findFirst.mockResolvedValue({
      ...baseAdmin,
      property: baseProperty,
    });

    const ctx = await requireAdmin();

    expect(ctx.admin.email).toBe('admin.namotu@koncie.app');
    expect((prisma as any).adminUser.findFirst).toHaveBeenCalledWith({
      where: { email: 'admin.namotu@koncie.app' },
      include: { property: true },
    });
  });
});
