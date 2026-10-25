import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Forgot password</h1>
      <ForgotPasswordForm />
      <p className="text-sm text-black/60">
        <Link className="underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
