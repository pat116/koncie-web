/**
 * Sprint 0 homepage — just the Koncie wordmark, centred, with a subtle
 * navy→green gradient. Deliberately empty. Every screen past this is
 * Sprint 1+ work.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <h1
        className="select-none text-6xl font-semibold tracking-tight sm:text-7xl md:text-8xl"
        style={{
          backgroundImage:
            'linear-gradient(135deg, hsl(var(--koncie-navy)) 0%, hsl(var(--koncie-green)) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Koncie
      </h1>
    </main>
  );
}
