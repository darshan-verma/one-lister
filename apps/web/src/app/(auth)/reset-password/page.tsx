import { Suspense } from "react";

import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
