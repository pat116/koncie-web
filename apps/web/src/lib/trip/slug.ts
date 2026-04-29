/**
 * Sprint 7 — Trip slug generator.
 *
 * Spec doc §8.2. Locked at Trip creation, immutable on amendment
 * (kickoff §12.3 lock). Property-themed; collision suffixes are `-2`,
 * `-3`, …. Profanity is replaced with a 4-char hex stub via
 * `./profanity.ts` rather than silently dropped.
 *
 * Pilot scale: per-property creates are infrequent enough that one query
 * per probe is fine. Bulk SELECT with LIKE is over-engineering pre-pilot
 * (kickoff §3.S7-11 note).
 *
 * Called inside the Trip-create transaction (S7-12) so collision detection
 * is consistent with the eventual INSERT — `tx` is the Prisma transaction
 * client.
 */

import type { PrismaClient } from '@prisma/client';
import { isProfaneToken, profanityStubFor } from './profanity';

/** Spec doc §8.2: 60-char hard limit. The kebab-cased base is truncated
 *  before profanity scrubbing so the resulting slug never exceeds this. */
const SLUG_MAX_LEN = 60;

/**
 * Convert a free-form property name to a kebab-cased base slug. Rules:
 *   1. Lowercase.
 *   2. Replace anything that isn't [a-z0-9] with `-`.
 *   3. Collapse runs of `-`.
 *   4. Trim leading/trailing `-`.
 *   5. Truncate to 60 chars.
 *
 * Exported for unit testing — callers should usually go through
 * `generateTripSlug`.
 */
export function kebabCase(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN);
}

/**
 * Run the kebab-cased base through the profanity scrub. Returns the
 * scrubbed slug (still ≤60 chars).
 */
export function scrubProfanity(base: string): string {
  return base
    .split('-')
    .map((token) =>
      token.length > 0 && isProfaneToken(token) ? profanityStubFor(token) : token,
    )
    .filter((token) => token.length > 0)
    .join('-');
}

export interface GenerateTripSlugInput {
  propertyName: string;
  /**
   * Prisma client OR transaction client. The function only does
   * `findUnique` / `findFirst` reads here; the eventual `create` is the
   * caller's responsibility (so collision detection stays inside the
   * caller's transaction).
   */
  tx: Pick<PrismaClient, 'trip'>;
}

/**
 * Spec doc §8.2 algorithm.
 *
 *   1. base = kebabCase(propertyName), 60-char cap.
 *   2. Profanity scrub each `-`-separated token.
 *   3. If `base` is unused → return base.
 *   4. Probe `${base}-2`, `${base}-3`, … and return the first free.
 *
 * Empty input is rejected — callers should never pass an empty
 * propertyName, and silent fallback to a UUID would let bugs through.
 */
export async function generateTripSlug(
  input: GenerateTripSlugInput,
): Promise<string> {
  const { propertyName, tx } = input;
  const trimmed = propertyName.trim();
  if (trimmed.length === 0) {
    throw new Error('generateTripSlug: propertyName is empty');
  }

  const base = scrubProfanity(kebabCase(trimmed));
  if (base.length === 0) {
    // Every token was profanity AND scrubbing produced no output (e.g. the
    // full name kebab-cased to a profanity stem). Fall back to a single
    // hex stub of the full name — still deterministic + recognisable.
    const stub = profanityStubFor(trimmed);
    return stub;
  }

  // Probe the bare slug first.
  const existing = await tx.trip.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing) return base;

  // Probe collision suffixes. Pilot scale → one query per probe is fine.
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    const taken = await tx.trip.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // 1000 collisions on the same property is implausible at pilot scale —
  // surface loudly rather than silently truncate or hash.
  throw new Error(
    `generateTripSlug: exhausted 1000 collision suffixes for base "${base}"`,
  );
}
