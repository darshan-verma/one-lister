import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        One Lister
      </p>
      {children}
    </main>
  );
}
