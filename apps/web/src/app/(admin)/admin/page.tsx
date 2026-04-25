import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import {
  computeRevenueKpis,
  listPriorityAlerts,
  type RevenueKpis,
} from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

function formatAud(minor: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-koncie-border bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-koncie-navy">{value}</p>
      {sub ? <p className="mt-1 text-xs text-koncie-charcoal/60">{sub}</p> : null}
    </div>
  );
}

function AttachRateBar({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.min(1, Math.max(0, ratio));
  return (
    <div>
      <div className="flex justify-between text-xs text-koncie-charcoal/70">
        <span>{label}</span>
        <span className="font-semibold text-koncie-charcoal">
          {formatPct(ratio)}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-koncie-sand">
        <div
          className="h-2 rounded-full bg-koncie-green"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { property } = await requireAdmin();
  const [kpis, alerts]: [RevenueKpis, Awaited<ReturnType<typeof listPriorityAlerts>>] =
    await Promise.all([
      computeRevenueKpis(property.id),
      listPriorityAlerts(property.id),
    ]);

  const topAlerts = alerts.slice(0, 5);

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Overview · read-only pilot dashboard
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          {property.name}
        </h1>
        <p className="text-sm text-koncie-charcoal/70">
          Koncie is generating ancillary revenue on your confirmed bookings.
          Attach rates below track board-deck targets (&gt;5% insurance,
          &gt;3% flights).
        </p>
      </header>

      <section
        aria-labelledby="kpis-heading"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <h2 id="kpis-heading" className="sr-only">
          Revenue KPIs
        </h2>
        <KpiTile
          label="Koncie fee captured"
          value={formatAud(kpis.totalCapturedMinor)}
          sub="Upsells + insurance commission"
        />
        <KpiTile
          label="Confirmed bookings"
          value={String(kpis.bookingsConfirmed)}
          sub={`${kpis.guestCount} guests on Koncie`}
        />
        <KpiTile
          label="Upsell revenue"
          value={formatAud(kpis.upsellCapturedMinor)}
          sub="Activities, spa, transfers, dining"
        />
        <KpiTile
          label="Insurance revenue"
          value={formatAud(kpis.insuranceCapturedMinor)}
          sub="30% commission · CoverMore"
        />
      </section>

      <section
        aria-labelledby="attach-heading"
        className="rounded-2xl border border-koncie-border bg-white p-5"
      >
        <h2
          id="attach-heading"
          className="text-sm font-semibold text-koncie-navy"
        >
          Attach rates (per confirmed booking)
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <AttachRateBar label="Upsell" ratio={kpis.upsellAttachRate} />
          <AttachRateBar label="Insurance" ratio={kpis.insuranceAttachRate} />
          <AttachRateBar label="Flights" ratio={kpis.flightAttachRate} />
        </div>
        <p className="mt-3 text-xs text-koncie-charcoal/60">
          Flight revenue is processed by Jet Seeker directly and not captured
          under Kovena MoR. Attach rate here reflects flight-booking ingestion
          volume.
        </p>
      </section>

      <section
        aria-labelledby="alerts-heading"
        className="rounded-2xl border border-koncie-border bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h2
            id="alerts-heading"
            className="text-sm font-semibold text-koncie-navy"
          >
            Priority alerts
          </h2>
          <Link
            href="/admin/alerts"
            className="text-xs font-medium text-koncie-green-cta hover:underline"
          >
            View all
          </Link>
        </div>
        {topAlerts.length === 0 ? (
          <p className="mt-3 text-sm text-koncie-charcoal/60">
            No active alerts — nothing needs your attention right now.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-koncie-border/70">
            {topAlerts.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 py-3 text-sm text-koncie-charcoal"
              >
                <span
                  className={
                    a.severity === 'critical'
                      ? 'mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-destructive'
                      : 'mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-koncie-green'
                  }
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p>{a.message}</p>
                  <p className="text-xs text-koncie-charcoal/60">
                    {a.guestEmail} · {a.occurredAt.toDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-koncie-border bg-white p-5">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-koncie-navy">
            Export upsell transactions
          </h2>
          <p className="text-xs text-koncie-charcoal/60">
            CSV of every captured, pending, and failed upsell transaction for
            your property — suitable for revenue reconciliation.
          </p>
        </div>
        <a
          href="/admin/export/upsells"
          className="rounded-xl bg-koncie-navy px-4 py-2 text-sm font-semibold text-white hover:bg-koncie-navy/90"
          download
        >
          Download CSV
        </a>
      </section>
    </>
  );
}
