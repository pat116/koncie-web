import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { SignedLinkError } from '@/lib/errors';

export interface MagicLinkPayload {
  bookingId: string;
  guestEmail: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.KONCIE_SIGNED_LINK_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'KONCIE_SIGNED_LINK_SECRET must be set and at least 32 chars',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signMagicLink(input: {
  bookingId: string;
  guestEmail: string;
  expiresInSeconds: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    bookingId: input.bookingId,
    guestEmail: input.guestEmail,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + input.expiresInSeconds)
    .sign(getSecret());
}

export async function verifyMagicLink(token: string): Promise<MagicLinkPayload> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const { bookingId, guestEmail } = payload as Record<string, unknown>;
    if (typeof bookingId !== 'string' || typeof guestEmail !== 'string') {
      throw new SignedLinkError('malformed');
    }
    return { bookingId, guestEmail };
  } catch (e) {
    if (e instanceof SignedLinkError) throw e;
    if (e instanceof joseErrors.JWTExpired) throw new SignedLinkError('expired');
    if (
      e instanceof joseErrors.JWSSignatureVerificationFailed ||
      e instanceof joseErrors.JWSInvalid
    ) {
      throw new SignedLinkError('invalid_signature');
    }
    throw new SignedLinkError('malformed');
  }
}
