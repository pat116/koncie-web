import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { linkGuestToAuthUser } from '@/lib/auth/guest-linking';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/hub';

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

  return NextResponse.redirect(`${origin}${next}`);
}
