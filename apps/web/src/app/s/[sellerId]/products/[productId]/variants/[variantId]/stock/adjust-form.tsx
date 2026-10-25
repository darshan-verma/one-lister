"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

type Props = {
  action: (formData: FormData) => Promise<{ error?: string }>;
};

export function AdjustStockForm({ action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Stable across double-submits of the same attempt; rotated after success.
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const formId = useId();

  return (
    <form
      id={formId}
      className="flex flex-col gap-3 rounded border border-black/10 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await action(fd);
          if (res.error) setError(res.error);
          else {
            e.currentTarget.reset();
            setClientRequestId(crypto.randomUUID());
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-medium">Adjust stock</h2>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      <label className="flex flex-col gap-1 text-sm">
        Delta
        <input
          name="delta"
          type="number"
          required
          className="rounded border border-black/15 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Reason
        <select
          name="reason"
          className="rounded border border-black/15 px-3 py-2"
          defaultValue="receive"
        >
          <option value="receive">Receive (positive)</option>
          <option value="adjustment">Adjustment (+/−)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note
        <input
          name="note"
          className="rounded border border-black/15 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Apply"}
      </button>
    </form>
  );
}
