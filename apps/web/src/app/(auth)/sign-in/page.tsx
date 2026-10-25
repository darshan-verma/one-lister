import Link from "next/link";
import { Suspense } from "react";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <SignInForm />
      </Suspense>
      <p className="text-sm text-black/60">
        No account?{" "}
        <Link className="underline" href="/sign-up">
          Sign up
        </Link>
      </p>
    </>
  );
}
