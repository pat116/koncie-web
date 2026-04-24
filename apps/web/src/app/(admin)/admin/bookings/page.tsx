import { requireAdmin } from '@/lib/admin/auth';
import { listBookingsForProperty } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date): string {
  return d.toDateString();
}

export default async function AdminBookingsPage() {
  const { property } = await requireAdmin();
  const rows = await listBookingsForProperty(property.id);

  const hotelCount = rows.filter((r) => r.kind === 'hotel').length;
  const flightCount = rows.filter((r) => r.kind === 'flight').length;

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Bookings
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          {hotelCount} hotel · {flightCount} flight
        </h1>
        <p className="text-sm text-koncie-charcoal/70">
          Hotel stays from HotelLink · flights ingested from Jet Seeker.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-koncie-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-koncie-sand text-xs uppercase tracking-wide text-koncie-charcoal/70">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Guest</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Detail</th>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-koncie-charcoal/60"
                >
                  No bookings yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-koncie-border/60">
                  <td className="px-4 py-3">
                    {r.kind === 'hotel' ? (
                      <span className="rounded-full bg-koncie-navy/10 px-2 py-0.5 text-xs font-medium text-koncie-navy">
                        Hotel
                      </span>
                    ) : (
                      <span className="rounded-full bg-koncie-green/15 px-2 py-0.5 text-xs font-medium text-koncie-green">
                        Flight
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.guestEmail}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-koncie-charcoal/80">
                    {r.externalRef}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.kind === 'hotel'
                      ? `${r.numGuests} guest${r.numGuests === 1 ? '' : 's'}`
                      : `${r.origin} → ${r.destination} · ${r.carrier}`}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.kind === 'hotel'
                      ? `${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}`
                      : `${fmtDate(r.departureAt)}${r.returnAt ? ` → ${fmtDate(r.returnAt)}` : ''}`}
                  </td>
                  <td className="px-4 py-3">
                    {r.kind === 'hotel' ? (
                      <span className="text-xs text-koncie-charcoal/70">
                        {r.status}
                      </span>
                    ) : (
                      <span className="text-xs text-koncie-charcoal/50">
                        Jet Seeker
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-koncie-charcoal/60">
        Powered by HotelLink · Jet Seeker. Koncie never touches the underlying
        room or flight booking transaction.
      </p>
    </>
  );
}
