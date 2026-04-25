'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  // Land on the homepage demo launcher rather than /welcome (which would
  // render LinkExpiredState because the route requires a magic-link token).
  redirect('/');
}
