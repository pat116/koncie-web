import { BottomNav } from '@/components/hub/bottom-nav';

export default function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-koncie-sand pb-20">
      <header className="flex items-center justify-between bg-koncie-navy px-5 py-4">
        <h1 className="font-semibold text-white">Koncie</h1>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-koncie-green font-bold text-koncie-navy">
          J
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-md outline-none">{children}</main>
      <BottomNav />
    </div>
  );
}
