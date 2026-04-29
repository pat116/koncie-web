/**
 * Sprint 7 — slug profanity filter.
 *
 * English-first, hand-curated deny-list. The only consumer is the slug
 * generator (`generateTripSlug`), which tokenises the kebab-cased property
 * name and replaces any token matching this list with a short hex suffix —
 * silent drops are a worse user surface (the slug becomes unrecognisable)
 * than a visible stub.
 *
 * Phase 2 (post-pilot) will internationalise per kickoff §6 #4 lock.
 *
 * The list is intentionally small + conservative. It catches obvious
 * issues without false-positive on common geographic / brand tokens.
 * Pat sanity-checks the list before merge.
 */

import { createHash } from 'node:crypto';

// Lowercased single tokens. Match is case-insensitive; the slug
// generator lower-cases tokens before consulting this set.
const DENY_LIST: ReadonlySet<string> = new Set([
  // mild profanity
  'damn',
  'crap',
  'piss',
  'suck',
  'sucks',
  // strong profanity (truncated stems matched separately)
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'arsehole',
  'cock',
  'dick',
  'twat',
  'wank',
  'wanker',
  'tit',
  'tits',
  // slurs (race / orientation / disability) — minimal core; not exhaustive
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'kike',
  'spic',
  'chink',
  'gook',
  'wog',
  'paki',
  'cripple',
  'retard',
  'retarded',
  // sexual
  'porn',
  'pornography',
  'sex',
  'sexy',
  'naked',
  'nude',
  // body / scatology
  'shitty',
  'shithole',
  // drug references
  'cocaine',
  'heroin',
  // misc
  'kill',
  'die',
  'death',
]);

/**
 * Return true if `token` (a single hyphen-separated slug segment) matches
 * the deny-list. Case-insensitive. Whitespace and punctuation in `token`
 * disqualifies it from matching — the caller should hand us already-
 * tokenised pieces.
 */
export function isProfaneToken(token: string): boolean {
  return DENY_LIST.has(token.toLowerCase());
}

/**
 * Return a short, deterministic 4-character hex stub for `token`. Used by
 * the slug generator to replace deny-listed tokens — the substitution is
 * stable (re-running generation on the same name produces the same slug).
 */
export function profanityStubFor(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 4);
}
