import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

/**
 * Sprint 5 MVP — messages view is a stub.
 *
 * Transactional email delivery (magic-link claim, receipts) is wired via
 * Resend from Sprint 1 but we do not currently persist a sent-mail audit
 * record. Sprint 6 will add a `MessageLog` model + Resend webhook ingestion
 * and this page will render the per-guest timeline.
 *
 * Rendering the empty-state now (rather than hiding the nav item) gives the
 * pilot hotel an accurate "we know this is coming" placeholder — not a
 * broken link.
 */
export default async function AdminMessagesPage() {
  const { property } = await requireAdmin();

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
          Messages
        </p>
        <h1 className="text-2xl font-semibold text-koncie-navy">
          Transactional message log
        </h1>
      </header>

      <section className="rounded-2xl border border-koncie-border bg-white p-6">
        <p className="text-sm text-koncie-charcoal">
          Koncie sends transactional email to guests at {property.name} via
          Resend (magic-link account claim, receipts, policy documents).
          Persisted send history arrives in Sprint 6 with pre-arrival triggers.
        </p>
        <p className="mt-3 text-xs text-koncie-charcoal/60">
          Read-only audit view — no send actions from this surface.
        </p>
      </section>
    </>
  );
}
