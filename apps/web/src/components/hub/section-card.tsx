export interface SectionCardProps {
  icon: string;
  title: string;
  subtitle: string;
  href?: string;
}

export function SectionCard({ icon, title, subtitle, href }: SectionCardProps) {
  const inner = (
    <>
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-koncie-green/15 text-sm"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-koncie-charcoal">{title}</p>
        <p className="text-xs text-koncie-charcoal/60">{subtitle}</p>
      </div>
      <span className="text-lg text-koncie-charcoal/30" aria-hidden="true">
        ›
      </span>
    </>
  );

  const cls =
    'flex items-center gap-3 rounded-xl border border-koncie-border bg-white p-4';
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
