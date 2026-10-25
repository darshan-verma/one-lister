import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { sellerMembers } from "@one-lister/db";

import { getAppDb } from "@/lib/db";
import { requireUser } from "@/server/auth";

import { CreateSellerForm } from "./create-seller-form";

export default async function CreateSellerPage() {
  const user = await requireUser();
  if (!user.emailVerified) {
    redirect("/verify-email");
  }

  const db = getAppDb();
  const memberships = await db.query.sellerMembers.findMany({
    where: eq(sellerMembers.userId, user.id),
  });
  if (memberships.length === 1 && memberships[0]) {
    redirect(`/s/${memberships[0].sellerId}`);
  }
  if (memberships.length > 1) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        One Lister
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Create your seller</h1>
      <p className="text-sm text-black/70">
        Set up your business profile. You can invite teammates later.
      </p>
      <CreateSellerForm />
    </main>
  );
}
