/**
 * Dev + CI-only helper that signs a Playwright test session in as the seeded
 * guest without the magic-link round-trip. Guarded so it CANNOT run in a
 * Vercel production build unless `KONCIE_ENABLE_TEST_ROUTES=1` is explicitly
 * set.
 *
 * Flow:
 *   1. Verify we're in dev OR test-routes are explicitly enabled
 *   2. Use the Supabase admin client (service role) to mint a magic link for
 *      the seed email
 *   3. Parse the token_hash out of the returned action_link
 *   4. Call verifyOtp from the route-handler context so the session cookie
 *      lands on the response
 *   5. Redirect to /hub
 *
 * Used by apps/web/tests/e2e/checkout.spec.ts in its `beforeEach`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function isAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.KONCIE_ENABLE_TEST_ROUTES === '1';
}

export async function GET(request: NextRequest) {
  if (!isAllowed()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const seedEmail = process.env.KONCIE_SEED_EMAIL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!seedEmail || !supabaseUrl || !anonKey || !serviceKey) {
    return new NextResponse(
      'Missing one of: KONCIE_SEED_EMAIL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
      { status: 500 },
    );
  }

  // Admin client — mints a magic link server-side, does not set any session
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: seedEmail,
  });

  if (linkError || !linkData?.properties?.action_link) {
    return new NextResponse(
      `Failed to generate admin magic link: ${linkError?.message ?? 'unknown error'}`,
      { status: 500 },
    );
  }

  // Extract token_hash + type from the Supabase-generated action link
  const actionUrl = new URL(linkData.properties.action_link);
  const tokenHash = actionUrl.searchParams.get('token');
  const type = (actionUrl.searchParams.get('type') ?? 'magiclink') as 'magiclink' | 'signup';

  if (!tokenHash) {
    return new NextResponse('Admin-generated link missing token_hash parameter', { status: 500 });
  }

  // Route-handler Supabase client — writing cookies here persists the session
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (
        items: Array<{ name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }>,
      ) => {
        items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (verifyError) {
    return new NextResponse(`verifyOtp failed: ${verifyError.message}`, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/hub`, { status: 303 });
}
