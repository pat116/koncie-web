/**
 * Phone-bezel chrome around the chat surface (Sprint-6 completion §3.S6-06).
 * Header reads "Koncie Concierge" — locked. Per-property persona branding
 * (e.g. "Blue Lagoon Resort AI") defers to Phase 2.
 */

import * as React from 'react';

export function PhoneShell({
  propertyName,
  children,
}: {
  propertyName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-koncie-sand">
      <header className="flex items-center justify-between border-b border-koncie-border bg-white px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-koncie-charcoal/60">
            Koncie Concierge
          </p>
          <p className="text-sm font-semibold text-koncie-navy">
            {propertyName}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-koncie-green font-bold text-koncie-navy">
          K
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
