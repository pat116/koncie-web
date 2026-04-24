import { redirect } from 'next/navigation';
import type { AdminUser, Property } from '@prisma/client';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

export type AdminContext = {
  admin: AdminUser;
  property: Property;
};

/**
 * Server-side guard for admin pages and route handlers.
 *
 * Redirects to /welcome when:
 *  - there is no Supabase session
 *  - the signed-in email has no matching `AdminUser` row
 *
 * Returns `{ admin, property }` — every admin in Sprint 5 is pinned to one
 * `propertyId`, so downstream queries can tenant-scope deterministically.
 *
 * Admins authenticate through the same Supabase identity layer as guests
 * (email + magic link, wired in Sprint 1). We intentionally don't redirect
 * to a separate admin sign-in screen — `/welcome` is the single entry point.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/welcome?error=admin_unauthenticated');

  const admin = await prisma.adminUser.findFirst({
    where: user.id
      ? { OR: [{ authUserId: user.id }, { email: user.email }] }
      : { email: user.email },
    include: { property: true },
  });

  if (!admin) redirect('/welcome?error=not_an_admin');

  // Split the include — callers get the admin row without the property join
  // so the return shape matches AdminContext exactly.
  const { property, ...adminFields } = admin;
  return { admin: adminFields as AdminUser, property };
}
