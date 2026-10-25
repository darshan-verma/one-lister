import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type AppSession, type SessionUser } from "@/lib/auth";

export type { AppSession, SessionUser };

/** Current Better Auth session, or null if signed out. */
export async function getSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/** Require a signed-in user; otherwise redirect to /sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/sign-in");
  }
  return session.user;
}
