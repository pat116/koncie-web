import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/welcome');

  return (
    <div className="px-5 pt-5">
      <h2 className="text-xl font-bold text-koncie-navy">Profile</h2>
      <div className="mt-6 rounded-xl border border-koncie-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
          Email
        </p>
        <p className="mt-1 font-semibold text-koncie-charcoal">{user.email}</p>
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-full border border-koncie-navy px-5 py-3 text-sm font-semibold text-koncie-navy"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-xs text-koncie-charcoal/60">
        Need to delete your account? Contact us at{' '}
        <a className="text-koncie-green-cta" href="mailto:hello@koncie.app">
          hello@koncie.app
        </a>
      </p>
    </div>
  );
}
