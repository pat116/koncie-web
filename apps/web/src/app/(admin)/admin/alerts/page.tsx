import { requireAdmin } from '@/lib/admin/auth';
import { listPriorityAlerts } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

const SEVERITY_LABEL: Record<'warning' | 'critical', string> = {
  critical: 'Critical',
  warning: 'Warning',
};

export default async function AdminAlertsPage() {
  const { property } = await requireAdmin();
  const alerts = await listPriorityAlerts(property.id);

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Priority alerts
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          {alerts.length} active
        </h1>
        <p className="text-sm text-koncie-charcoal/70">
          Derived from the Koncie database: failed payments, failed insurance
          captures, expiring quotes, and unclaimed near-arrival guests.
        </p>
      </header>

      {alerts.length === 0 ? (
        <p className="rounded-2xl border border-koncie-border bg-white p-6 text-sm text-koncie-charcoal/60">
          Nothing to flag. All ancillary captures for {property.name} are
          clean and every near-arrival guest has claimed their Koncie account.
        </p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-4 rounded-2xl border border-koncie-border bg-white p-5"
            >
              <span
                className={
                  a.severity === 'critical'
                    ? 'mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-destructive'
                    : 'mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-koncie-green'
                }
                aria-hidden="true"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span
                    className={
                      a.severity === 'critical'
                        ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-destructive'
                        : 'rounded-full bg-koncie-green/15 px-2 py-0.5 text-koncie-green'
                    }
                  >
                    {SEVERITY_LABEL[a.severity]}
                  </span>
                  <span className="text-koncie-charcoal/50">
                    {a.kind.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-koncie-charcoal">
                  {a.message}
                </p>
                <p className="mt-1 text-xs text-koncie-charcoal/60">
                  {a.guestEmail} · {a.occurredAt.toDateString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
