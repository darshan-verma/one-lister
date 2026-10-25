"use client";

import { useMemo, useState, useTransition } from "react";

import { createProductAction } from "../actions";

type Option = { name: string; values: string[] };

type VariantRow = {
  attributes: Record<string, string>;
  sku: string;
  sellingPriceRupees: string;
  mrpRupees: string;
  initialStock: string;
};

function cartesian(options: Option[]): Array<Record<string, string>> {
  if (options.length === 0) return [{}];
  let combos: Array<Record<string, string>> = [{}];
  for (const opt of options) {
    const next: Array<Record<string, string>> = [];
    for (const combo of combos) {
      for (const value of opt.values.filter((v) => v.trim())) {
        next.push({ ...combo, [opt.name]: value.trim() });
      }
    }
    combos = next;
  }
  return combos;
}

function suggestSku(title: string, attrs: Record<string, string>): string {
  const slug = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "PRODUCT";
  const parts = [slug, ...Object.values(attrs).map((v) =>
    v.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
  )];
  return parts.join("-");
}

type Props = { sellerId: string };

export function NewProductForm({ sellerId }: Props) {
  const [title, setTitle] = useState("");
  const [selling, setSelling] = useState("1299.50");
  const [mrp, setMrp] = useState("1499.00");
  const [options, setOptions] = useState<Option[]>([]);
  const [variantEdits, setVariantEdits] = useState<Record<string, Partial<VariantRow>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const combos = useMemo(() => cartesian(options), [options]);

  const rows: VariantRow[] = combos.map((attrs) => {
    const key = JSON.stringify(attrs);
    const edit = variantEdits[key] ?? {};
    return {
      attributes: attrs,
      sku: edit.sku ?? suggestSku(title || "product", attrs),
      sellingPriceRupees: edit.sellingPriceRupees ?? selling,
      mrpRupees: edit.mrpRupees ?? mrp,
      initialStock: edit.initialStock ?? "0",
    };
  });

  function updateRow(attrs: Record<string, string>, patch: Partial<VariantRow>) {
    const key = JSON.stringify(attrs);
    setVariantEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProductAction(sellerId, {
        title,
        sellingPriceRupees: Number(selling),
        mrpRupees: Number(mrp),
        options: options.filter((o) => o.name.trim() && o.values.some((v) => v.trim())),
        variants: rows.map((r) => ({
          attributes: r.attributes,
          sku: r.sku,
          sellingPriceRupees: Number(r.sellingPriceRupees),
          mrpRupees: Number(r.mrpRupees),
          initialStock: Number(r.initialStock) || 0,
        })),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Basics</h2>
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-black/15 bg-white px-3 py-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Selling price (₹)
            <input
              required
              value={selling}
              onChange={(e) => setSelling(e.target.value)}
              className="rounded border border-black/15 bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            MRP (₹)
            <input
              required
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              className="rounded border border-black/15 bg-white px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Options</h2>
          <button
            type="button"
            className="text-sm underline"
            onClick={() =>
              setOptions((o) => [...o, { name: "", values: [""] }])
            }
          >
            Add option
          </button>
        </div>
        {options.map((opt, oi) => (
          <div key={oi} className="rounded border border-black/10 bg-white p-3">
            <input
              placeholder="Option name (e.g. Size)"
              value={opt.name}
              onChange={(e) => {
                const next = [...options];
                next[oi] = { ...opt, name: e.target.value };
                setOptions(next);
              }}
              className="mb-2 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {opt.values.map((val, vi) => (
                <input
                  key={vi}
                  placeholder="Value"
                  value={val}
                  onChange={(e) => {
                    const values = [...opt.values];
                    values[vi] = e.target.value;
                    const next = [...options];
                    next[oi] = { ...opt, values };
                    setOptions(next);
                  }}
                  className="w-28 rounded border border-black/15 px-2 py-1 text-sm"
                />
              ))}
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  const next = [...options];
                  next[oi] = { ...opt, values: [...opt.values, ""] };
                  setOptions(next);
                }}
              >
                + value
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          Variants preview ({rows.length})
        </h2>
        <div className="overflow-x-auto rounded border border-black/10 bg-white">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase text-black/60">
              <tr>
                <th className="px-2 py-2">Options</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Price ₹</th>
                <th className="px-2 py-2">MRP ₹</th>
                <th className="px-2 py-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={JSON.stringify(row.attributes)} className="border-b border-black/5">
                  <td className="px-2 py-2 text-xs">
                    {Object.keys(row.attributes).length === 0
                      ? "Default"
                      : Object.entries(row.attributes)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.sku}
                      onChange={(e) =>
                        updateRow(row.attributes, { sku: e.target.value })
                      }
                      className="w-40 rounded border border-black/15 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.sellingPriceRupees}
                      onChange={(e) =>
                        updateRow(row.attributes, {
                          sellingPriceRupees: e.target.value,
                        })
                      }
                      className="w-24 rounded border border-black/15 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.mrpRupees}
                      onChange={(e) =>
                        updateRow(row.attributes, { mrpRupees: e.target.value })
                      }
                      className="w-24 rounded border border-black/15 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.initialStock}
                      onChange={(e) =>
                        updateRow(row.attributes, {
                          initialStock: e.target.value,
                        })
                      }
                      className="w-20 rounded border border-black/15 px-2 py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save as draft"}
      </button>
    </form>
  );
}
