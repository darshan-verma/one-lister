import Link from "next/link";

import { ResendVerificationButton } from "./resend-button";

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
      <p className="text-sm text-black/70">
        Check your inbox for a verification link. In local development the link
        is printed to the server console.
      </p>
      <ResendVerificationButton />
      <p className="text-sm text-black/60">
        <Link className="underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
