import type { Product, ProductImage, Variant } from "@one-lister/db";

import type { CompletenessMissing, CompletenessResult } from "./types.js";

export type CompletenessInput = {
  product: Product;
  variants: Variant[];
  images: ProductImage[];
};

/**
 * Required for status "active":
 * product: description, brand, hsn_code, gst_rate_bps, country_of_origin, ≥1 image
 * per variant: weight and all three dimensions
 */
export function checkCompleteness(input: CompletenessInput): CompletenessResult {
  const missing: CompletenessMissing[] = [];
  const { product, variants, images } = input;

  if (!product.description?.trim()) {
    missing.push({
      field: "description",
      message: "Product description is required",
    });
  }
  if (!product.brand?.trim()) {
    missing.push({ field: "brand", message: "Brand is required" });
  }
  if (!product.hsnCode?.trim()) {
    missing.push({ field: "hsn_code", message: "HSN code is required" });
  } else if (!/^\d{4}(\d{2})?(\d{2})?$/.test(product.hsnCode.trim())) {
    missing.push({
      field: "hsn_code",
      message: "HSN code must be 4, 6, or 8 digits",
    });
  }
  if (product.gstRateBps === null || product.gstRateBps === undefined) {
    missing.push({ field: "gst_rate_bps", message: "GST rate is required" });
  }
  if (!product.countryOfOrigin?.trim()) {
    missing.push({
      field: "country_of_origin",
      message: "Country of origin is required",
    });
  }
  if (images.length < 1) {
    missing.push({
      field: "images",
      message: "At least one product image is required",
    });
  }

  const activeVariants = variants.filter((v) => !v.deletedAt);
  for (const v of activeVariants) {
    if (v.weightGrams === null || v.weightGrams === undefined) {
      missing.push({
        field: "weight_grams",
        variantSku: v.sku,
        message: `Weight is required for variant ${v.sku}`,
      });
    }
    if (v.lengthMm === null || v.lengthMm === undefined) {
      missing.push({
        field: "length_mm",
        variantSku: v.sku,
        message: `Length is required for variant ${v.sku}`,
      });
    }
    if (v.widthMm === null || v.widthMm === undefined) {
      missing.push({
        field: "width_mm",
        variantSku: v.sku,
        message: `Width is required for variant ${v.sku}`,
      });
    }
    if (v.heightMm === null || v.heightMm === undefined) {
      missing.push({
        field: "height_mm",
        variantSku: v.sku,
        message: `Height is required for variant ${v.sku}`,
      });
    }
  }

  if (activeVariants.length === 0) {
    missing.push({
      field: "variants",
      message: "At least one variant is required",
    });
  }

  return { complete: missing.length === 0, missing };
}
