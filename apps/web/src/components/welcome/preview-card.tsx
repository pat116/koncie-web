export interface PreviewCardProps {
  icon: string;
  title: string;
  subtitle: string;
}

export function PreviewCard({ icon, title, subtitle }: PreviewCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-koncie-border bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-koncie-green/15 text-xl">
        <span aria-hidden="true">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-koncie-charcoal">{title}</p>
        <p className="text-xs text-koncie-charcoal/60">{subtitle}</p>
      </div>
    </div>
  );
}
