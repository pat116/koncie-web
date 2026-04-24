import type { MessageKind, MessageStatus } from '@prisma/client';
import { requireAdmin } from '@/lib/admin/auth';
import { listMessagesForProperty } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<MessageKind, string> = {
  MAGIC_LINK: 'Magic Link',
  UPSELL_REMINDER_T7: 'Upsell T-7',
  INSURANCE_REMINDER_T3: 'Insurance T-3',
  INSURANCE_RECEIPT: 'Insurance Receipt',
  HOTEL_BOOKING_CONFIRMED: 'Hotel Confirmed',
  OTHER: 'Other',
};

function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return `${d.toDateString()} ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
}

function statusPillClass(status: MessageStatus): string {
  switch (status) {
    case 'DELIVERED':
      return 'rounded-full bg-koncie-green/15 px-2 py-0.5 text-xs font-medium text-koncie-green';
    case 'SENT':
      return 'rounded-full bg-koncie-navy/10 px-2 py-0.5 text-xs font-medium text-koncie-navy';
    case 'QUEUED':
      return 'rounded-full bg-koncie-sand px-2 py-0.5 text-xs text-koncie-charcoal/60';
    case 'BOUNCED':
    case 'FAILED':
    case 'COMPLAINED':
      return 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive';
    default:
      return 'rounded-full bg-koncie-sand px-2 py-0.5 text-xs text-koncie-charcoal/60';
  }
}

export default async function AdminMessagesPage() {
  const { property } = await requireAdmin();
  const rows = await listMessagesForProperty(property.id);

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Messages
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          Transactional message log
        </h1>
        <p className="text-sm text-koncie-charcoal/70">
          Every email Koncie has dispatched for a {property.name} guest,
          newest first. Status updates stream in from Resend.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-koncie-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-koncie-sand text-xs uppercase tracking-wide text-koncie-charcoal/70">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Guest</th>
              <th className="px-4 py-3 font-semibold">Kind</th>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-koncie-charcoal/60"
                >
                  No messages yet. Magic-link, upsell-T-7, insurance-T-3, and
                  insurance-receipt emails will appear here once dispatched.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-koncie-border/60">
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {fmtDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.guestName ? (
                      <>
                        <span className="font-medium text-koncie-charcoal">
                          {r.guestName}
                        </span>{' '}
                        <span className="text-koncie-charcoal/60">
                          {r.guestEmail}
                        </span>
                      </>
                    ) : (
                      r.guestEmail
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-koncie-navy/5 px-2 py-0.5 text-xs text-koncie-navy">
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {r.subject}
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusPillClass(r.status)}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-koncie-charcoal/80">
                    {fmtDateTime(r.deliveredAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-koncie-charcoal/60">
        Delivered via Resend. Status updates via Resend&apos;s svix-signed
        webhook. Read-only audit — no send actions from this surface.
      </p>
    </>
  );
}
