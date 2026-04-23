import { prisma } from '@/lib/db/prisma';

/**
 * Link a Guest row to a Supabase auth user. Idempotent — repeated calls
 * with the same authUserId are effectively no-ops. `claimedAt` is set
 * only on the first successful link so we preserve the original claim
 * timestamp on retries.
 *
 * Throws if no Guest row exists for the given email (caller should
 * redirect to /welcome with `?error=no_matching_booking`).
 */
export async function linkGuestToAuthUser(params: {
  email: string;
  authUserId: string;
}) {
  const existing = await prisma.guest.findUnique({
    where: { email: params.email },
    select: { id: true, authUserId: true, claimedAt: true },
  });

  if (!existing) {
    throw new Error(`No Guest row for email ${params.email}`);
  }

  return prisma.guest.update({
    where: { email: params.email },
    data: {
      authUserId: params.authUserId,
      claimedAt: existing.claimedAt ?? new Date(),
    },
  });
}
