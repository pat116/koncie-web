import crypto from 'node:crypto';

/**
 * Verifies a Resend webhook signature. Resend uses svix for webhook signing.
 *
 * Signing algorithm (per svix docs):
 *   to_sign = `${svix_id}.${svix_timestamp}.${rawBody}`
 *   signature = HMAC_SHA256(secret_key_bytes, to_sign)
 *   sent_header = `v1,${base64(signature)}`  (may contain space-separated
 *                                               multiple pairs during rotation)
 *
 * The secret comes from the Resend dashboard webhook config and is prefixed
 * `whsec_` — the real key bytes are base64-decoded from the suffix.
 *
 * We implement this by hand rather than pulling in `svix` as a dep because
 * Resend is the only webhook origin we'll accept in Sprint 6 and the signing
 * primitive is small enough that adding a transitive dep isn't worth it.
 */
export type SvixVerifyInput = {
  secret: string; // whsec_xxxx
  body: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  toleranceSeconds?: number; // default 5 min
  now?: Date; // override for tests
};

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'timestamp_out_of_range' | 'bad_signature' | 'bad_secret' };

function secretBytes(secret: string): Buffer | null {
  if (!secret) return null;
  const stripped = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    return Buffer.from(stripped, 'base64');
  } catch {
    return null;
  }
}

export function verifySvixSignature(input: SvixVerifyInput): SvixVerifyResult {
  const { secret, body, svixId, svixTimestamp, svixSignature } = input;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'bad_signature' };
  }
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 5 * 60;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  const keyBytes = secretBytes(secret);
  if (!keyBytes) return { ok: false, reason: 'bad_secret' };

  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(toSign, 'utf8')
    .digest('base64');

  // Header may contain multiple "v1,..." pairs separated by spaces during
  // key rotation — accept if any matches.
  const pairs = svixSignature.split(' ');
  for (const raw of pairs) {
    const [scheme, sig] = raw.split(',');
    if (scheme !== 'v1' || !sig) continue;
    if (timingSafeEqualBase64(sig, expected)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}

function timingSafeEqualBase64(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'base64');
  const bufB = Buffer.from(b, 'base64');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
