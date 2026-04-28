/**
 * Supabase OTP callback. Sprint-6-completion extension: when a
 * bridge-token (`?bt=…`) is present, verify it and route to a
 * post-auth landing handler that consumes the `origin` payload and opens
 * the originating ancillary modal with state rehydrated.
 *
 * Bridge-token semantics live in `lib/chat/tokens.ts`; landing routes are
 * resolved by `landingPathForOrigin` below. The callback ignores `bt` if
 * verification fails — falling back to the standard `/hub` path rather than
 * surfacing token errors to the guest mid-auth.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { linkGuestToAuthUser } from '@/lib/auth/guest-linking';
import {
  verifyChatToken,
  type ChatTokenOrigin,
  type OriginCardKind,
} from '@/lib/chat/tokens';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const explicitNext = searchParams.get('next');
  const bridgeToken = searchParams.get('bt');

  const supabase = createSupabaseServerClient();

  let userEmail: string | null = null;
  let userId: string | null = null;

  // Path A — PKCE flow (?code=...)
  if (code) {
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user?.email) {
      console.error(
        '[auth/callback] exchangeCodeForSession failed:',
        error?.message,
      );
      return NextResponse.redirect(`${origin}/welcome?error=callback_failed`);
    }
    userEmail = data.user.email;
    userId = data.user.id;
  }
  // Path B — OTP token flow (?token_hash=...&type=signup|magiclink|email)
  else if (tokenHash && type) {
    const { error, data } = await supabase.auth.verifyOtp({
      type: type as
        | 'signup'
        | 'magiclink'
        | 'email'
        | 'recovery'
        | 'invite'
        | 'email_change',
      token_hash: tokenHash,
    });
    if (error || !data.session || !data.user?.email) {
      console.error('[auth/callback] verifyOtp failed:', error?.message);
      return NextResponse.redirect(`${origin}/welcome?error=callback_failed`);
    }
    userEmail = data.user.email;
    userId = data.user.id;
  } else {
    console.error('[auth/callback] no code or token_hash in params');
    return NextResponse.redirect(`${origin}/welcome?error=callback_missing`);
  }

  try {
    await linkGuestToAuthUser({ email: userEmail!, authUserId: userId! });
  } catch (e) {
    console.error('[auth/callback] linkGuestToAuthUser failed:', e);
    return NextResponse.redirect(
      `${origin}/welcome?error=no_matching_booking`,
    );
  }

  // Bridge-token branch — only consulted when `bt` is present and valid.
  // Verification errors are silently ignored; the guest is authenticated
  // either way, so falling back to /hub is the right UX (don't bounce them
  // back to a "link expired" surface mid-auth).
  if (bridgeToken) {
    let bridge;
    try {
      bridge = await verifyChatToken(bridgeToken);
    } catch {
      bridge = null;
    }
    if (bridge && bridge.origin) {
      const target = landingPathForOrigin(bridge.origin);
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}${explicitNext ?? '/hub'}`);
}

const ORIGIN_LANDING_BASE: Record<OriginCardKind, string> = {
  flight: '/hub?modal=flight',
  transfer: '/hub?modal=transfer',
  activity: '/hub/activities',
  dining: '/hub?modal=dining',
};

export function landingPathForOrigin(originPayload: ChatTokenOrigin): string {
  const base = ORIGIN_LANDING_BASE[originPayload.originCardKind];
  if (!base) return '/hub';
  // Encode the modal state as a base64url query param. The landing
  // surface re-hydrates from this on first paint.
  const stateBlob = Buffer.from(
    JSON.stringify(originPayload.originModalState),
  ).toString('base64url');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}st=${stateBlob}`;
}
