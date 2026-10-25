import { z } from "zod";

import { rupeesToPaise } from "../money.js";

/** UI enters rupees (e.g. 1299.50); core converts to integer paise. */
export const rupeesInputSchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(v.trim());
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Price must be a positive number" });
      return z.NEVER;
    }
    // At most 2 decimal places for INR.
    const rounded = Math.round(n * 100) / 100;
    if (Math.abs(rounded - n) > 1e-9) {
      ctx.addIssue({
        code: "custom",
        message: "Price may have at most 2 decimal places",
      });
      return z.NEVER;
    }
    return rupeesToPaise(n);
  });

export const hsnCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(\d{2})?(\d{2})?$/, "HSN must be 4, 6, or 8 digits");

export const productOptionSchema = z.object({
  name: z.string().trim().min(1).max(50),
  values: z.array(z.string().trim().min(1).max(50)).min(1).max(50),
});

export const variantOverrideSchema = z.object({
  /** Option attributes for this cell, e.g. { Size: "S", Colour: "Red" }. */
  attributes: z.record(z.string(), z.string()).default({}),
  sku: z.string().trim().min(1).max(100).optional(),
  /** Rupees from UI → paise. */
  sellingPriceRupees: rupeesInputSchema.optional(),
  mrpRupees: rupeesInputSchema.optional(),
  weightGrams: z.number().int().positive().optional(),
  lengthMm: z.number().int().positive().optional(),
  widthMm: z.number().int().positive().optional(),
  heightMm: z.number().int().positive().optional(),
  /** Initial stock quantity (non-negative). */
  initialStock: z.number().int().min(0).optional(),
  gtin: z.string().trim().min(1).max(32).optional(),
});

export const createProductInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).optional(),
  brand: z.string().trim().max(200).optional(),
  hsnCode: hsnCodeSchema.optional(),
  /** GST rate in basis points (1800 = 18%). */
  gstRateBps: z.number().int().min(0).max(10_000).optional(),
  countryOfOrigin: z.string().trim().max(100).optional(),
  /** Default selling price in rupees (converted to paise). Required. */
  sellingPriceRupees: rupeesInputSchema,
  mrpRupees: rupeesInputSchema,
  weightGrams: z.number().int().positive().optional(),
  lengthMm: z.number().int().positive().optional(),
  widthMm: z.number().int().positive().optional(),
  heightMm: z.number().int().positive().optional(),
  options: z.array(productOptionSchema).max(3).default([]),
  /** Per-variant overrides matching the generated matrix (or single default). */
  variants: z.array(variantOverrideSchema).optional(),
});

export const updateProductInputSchema = z.object({
  productId: z.string().uuid(),
  /** Client-loaded updatedAt for optimistic concurrency. */
  updatedAt: z.coerce.date(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  brand: z.string().trim().max(200).nullable().optional(),
  hsnCode: hsnCodeSchema.nullable().optional(),
  gstRateBps: z.number().int().min(0).max(10_000).nullable().optional(),
  countryOfOrigin: z.string().trim().max(100).nullable().optional(),
});

export const updateVariantInputSchema = z.object({
  variantId: z.string().uuid(),
  updatedAt: z.coerce.date(),
  sku: z.string().trim().min(1).max(100).optional(),
  sellingPriceRupees: rupeesInputSchema.optional(),
  mrpRupees: rupeesInputSchema.optional(),
  weightGrams: z.number().int().positive().nullable().optional(),
  lengthMm: z.number().int().positive().nullable().optional(),
  widthMm: z.number().int().positive().nullable().optional(),
  heightMm: z.number().int().positive().nullable().optional(),
  gtin: z.string().trim().min(1).max(32).nullable().optional(),
});

export const addVariantInputSchema = z.object({
  productId: z.string().uuid(),
  attributes: z.record(z.string(), z.string()).default({}),
  sku: z.string().trim().min(1).max(100).optional(),
  sellingPriceRupees: rupeesInputSchema,
  mrpRupees: rupeesInputSchema,
  weightGrams: z.number().int().positive().optional(),
  lengthMm: z.number().int().positive().optional(),
  widthMm: z.number().int().positive().optional(),
  heightMm: z.number().int().positive().optional(),
  gtin: z.string().trim().min(1).max(32).optional(),
});

export const requestImageUploadInputSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, "Image must be at most 10 MB"),
});

export const adjustStockInputSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
  reason: z.enum(["receive", "adjustment"]),
  note: z.string().trim().max(500).optional(),
  /** Client-generated uuid; form generates once so double-submits are safe. */
  clientRequestId: z.string().uuid(),
});

export type CreateProductInput = z.input<typeof createProductInputSchema>;
export type CreateProductParsed = z.output<typeof createProductInputSchema>;
export type UpdateProductInput = z.input<typeof updateProductInputSchema>;
export type UpdateVariantInput = z.input<typeof updateVariantInputSchema>;
export type AddVariantInput = z.input<typeof addVariantInputSchema>;
export type RequestImageUploadInput = z.input<typeof requestImageUploadInputSchema>;
export type AdjustStockInput = z.input<typeof adjustStockInputSchema>;
