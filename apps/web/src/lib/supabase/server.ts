import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookiesToSet = Array<{ name: string; value: string; options: CookieOptions }>;

/**
 * Supabase client for server components and route handlers.
 * Reads + writes session cookies via Next's cookies() helper.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component; cookie writes are not allowed
            // there. Safe to ignore — middleware refreshes sessions.
          }
        },
      },
    },
  );
}
