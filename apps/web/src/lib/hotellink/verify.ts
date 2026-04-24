import crypto from 'node:crypto';

/**
 * Verifies a HotelLink webhook signature.
 *
 * HotelLink is Kovena-owned so we define the signing scheme ourselves:
 *
 *   headers:
 *     X-HotelLink-Signature: sha256=<hex>
 *     X-HotelLink-Timestamp: <unix seconds>
 *
 *   to_sign   = `${timestamp}.${rawBody}`
 *   signature = HMAC_SHA256(secret_utf8_bytes, to_sign)  → hex
 *
 * The secret is any 32+ char random string; we use the raw UTF-8 bytes
 * directly (no base64 decoding — unlike svix, we're not matching an
 * existing wire format).
 *
 * Replay protection: reject if the timestamp is more than
 * `toleranceSeconds` (default 5 minutes) from now.
 */
export type HotelLinkVerifyInput = {
  secret: string;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  toleranceSeconds?: number;
  now?: Date;
};

export type HotelLinkVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_headers'
        | 'timestamp_out_of_range'
        | 'bad_signature'
        | 'bad_secret';
    };

export function verifyHotelLinkSignature(
  input: HotelLinkVerifyInput,
): HotelLinkVerifyResult {
  const { secret, rawBody, signatureHeader, timestampHeader } = input;

  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!secret) {
    return { ok: false, reason: 'bad_secret' };
  }

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'bad_signature' };
  }
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 5 * 60;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  // Accept either `sha256=<hex>` or bare `<hex>` to stay lenient to the
  // exact shape the emitter uses in early integration.
  const [scheme, providedHex] = signatureHeader.includes('=')
    ? signatureHeader.split('=', 2)
    : ['sha256', signatureHeader];
  if (scheme !== 'sha256' || !providedHex) {
    return { ok: false, reason: 'bad_signature' };
  }

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`, 'utf8')
    .digest('hex');

  if (!timingSafeEqualHex(providedHex, expectedHex)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
