export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">One Lister</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        List once. Sell everywhere.
      </h1>
      <p className="text-lg text-black/70">
        Seller dashboard scaffold is ready. Auth, catalog, and marketplace connectors
        come next.
      </p>
    </main>
  );
}
