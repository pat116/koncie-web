import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/guests', label: 'Guests' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/alerts', label: 'Priority Alerts' },
  { href: '/admin/messages', label: 'Messages' },
] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { admin, property } = await requireAdmin();

  return (
    <div className="min-h-screen bg-koncie-sand">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-64">
          <div className="mb-6 rounded-2xl bg-koncie-navy p-5 text-white">
            <p className="text-xs uppercase tracking-wide text-white/60">
              Koncie Admin
            </p>
            <p className="mt-1 text-lg font-semibold">{property.name}</p>
            <p className="text-xs text-white/70">
              {property.region}, {property.country}
            </p>
            <p className="mt-3 text-xs text-white/60">
              Signed in as {admin.firstName} {admin.lastName}
              <br />
              <span className="text-white/40">
                {admin.role.toLowerCase().replace('_', ' ')}
              </span>
            </p>
          </div>

          <nav
            aria-label="Admin sections"
            className="flex flex-col gap-1 rounded-2xl border border-koncie-border bg-white p-2"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm font-medium text-koncie-charcoal hover:bg-koncie-sand"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 rounded-2xl border border-koncie-border bg-white p-4 text-xs text-koncie-charcoal/70">
            <p className="font-semibold text-koncie-charcoal">Powered by</p>
            <p className="mt-1">HotelLink · Kovena MoR (MCC 4722)</p>
          </div>
        </aside>

        <main id="main-content" tabIndex={-1} className="flex-1 space-y-6 outline-none">{children}</main>
      </div>
    </div>
  );
}
