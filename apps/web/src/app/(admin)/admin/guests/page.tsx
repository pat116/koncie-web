import { requireAdmin } from '@/lib/admin/auth';
import { listGuestsForProperty } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null): string {
  return d ? d.toDateString() : '—';
}

export default async function AdminGuestsPage() {
  const { property } = await requireAdmin();
  const rows = await listGuestsForProperty(property.id);

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Guests
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          {rows.length} guest{rows.length === 1 ? '' : 's'} on Koncie
        </h1>
        <p className="text-sm text-koncie-charcoal/70">
          Everyone with a confirmed booking at {property.name}.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-koncie-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-koncie-sand text-xs uppercase tracking-wide text-koncie-charcoal/70">
            <tr>
              <th className="px-4 py-3 font-semibold">Guest</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Next check-in</th>
              <th className="px-4 py-3 font-semibold">Bookings</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-koncie-charcoal/60"
                >
                  No guests yet. Seeded bookings will appear here once they
                  claim their Koncie account.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.guestId}
                  className="border-t border-koncie-border/60"
                >
                  <td className="px-4 py-3 font-medium text-koncie-charcoal">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.email}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {fmtDate(r.nextCheckIn)}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.bookingCount}
                  </td>
                  <td className="px-4 py-3">
                    {r.claimed ? (
                      <span className="rounded-full bg-koncie-green/15 px-2 py-0.5 text-xs font-medium text-koncie-green">
                        Claimed
                      </span>
                    ) : (
                      <span className="rounded-full bg-koncie-sand px-2 py-0.5 text-xs text-koncie-charcoal/60">
                        Unclaimed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {fmtDate(r.lastActivity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
