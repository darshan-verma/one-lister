"use server";

import {
  addVariant,
  adjustStock,
  archiveProduct,
  archiveVariant,
  confirmImageUpload,
  createProduct,
  deleteImage,
  IncompleteProductError,
  ProductNotFoundError,
  reorderImages,
  requestImageUpload,
  setInitialStock,
  setProductStatus,
  updateProduct,
  updateVariant,
  type CreateProductInput,
} from "@one-lister/core";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { getJobEnqueuer } from "@/lib/jobs";
import { getObjectStorage } from "@/lib/storage";
import { mapActionError } from "@/server/action-errors";
import { requireSellerContext } from "@/server/auth";

export type ActionState = {
  error?: string;
  missing?: Array<{ field: string; variantSku?: string; message: string }>;
};

function revalidateProduct(sellerId: string, productId?: string) {
  revalidatePath(`/s/${sellerId}/products`);
  if (productId) {
    revalidatePath(`/s/${sellerId}/products/${productId}`);
  }
}

export async function createProductAction(
  sellerId: string,
  input: CreateProductInput,
): Promise<ActionState | void> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const { product, variants } = await createProduct(getAppDb(), ctx, input);

    // Apply initial stock from variant overrides when provided.
    for (let i = 0; i < (input.variants?.length ?? 0); i++) {
      const override = input.variants?.[i];
      const variant = variants[i];
      if (override?.initialStock && override.initialStock > 0 && variant) {
        const clientRequestId = crypto.randomUUID();
        await setInitialStock(getAppDb(), ctx, variant.id, {
          quantity: override.initialStock,
          clientRequestId,
        });
      }
    }

    revalidateProduct(ctx.sellerId, product.id);
    redirect(`/s/${ctx.sellerId}/products/${product.id}`);
  } catch (err) {
    return { error: mapActionError(err, "createProductAction") };
  }
}

export async function updateProductAction(
  sellerId: string,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const productId = String(formData.get("productId") ?? "");
    const updatedAt = String(formData.get("updatedAt") ?? "");
    await updateProduct(getAppDb(), ctx, {
      productId,
      updatedAt: new Date(updatedAt),
      title: String(formData.get("title") ?? "") || undefined,
      description: String(formData.get("description") ?? "") || null,
      brand: String(formData.get("brand") ?? "") || null,
      hsnCode: String(formData.get("hsnCode") ?? "") || null,
      gstRateBps: formData.get("gstRateBps")
        ? Number(formData.get("gstRateBps"))
        : null,
      countryOfOrigin: String(formData.get("countryOfOrigin") ?? "") || null,
    });
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    return { error: mapActionError(err, "updateProductAction") };
  }
}

export async function updateVariantAction(
  sellerId: string,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const variantId = String(formData.get("variantId") ?? "");
    const productId = String(formData.get("productId") ?? "");
    const updatedAt = String(formData.get("updatedAt") ?? "");
    const selling = formData.get("sellingPriceRupees");
    const mrp = formData.get("mrpRupees");
    await updateVariant(getAppDb(), ctx, {
      variantId,
      updatedAt: new Date(updatedAt),
      sku: String(formData.get("sku") ?? "") || undefined,
      sellingPriceRupees: selling ? Number(selling) : undefined,
      mrpRupees: mrp ? Number(mrp) : undefined,
      weightGrams: formData.get("weightGrams")
        ? Number(formData.get("weightGrams"))
        : null,
      lengthMm: formData.get("lengthMm")
        ? Number(formData.get("lengthMm"))
        : null,
      widthMm: formData.get("widthMm") ? Number(formData.get("widthMm")) : null,
      heightMm: formData.get("heightMm")
        ? Number(formData.get("heightMm"))
        : null,
    });
    revalidateProduct(ctx.sellerId, productId);
    revalidatePath(
      `/s/${ctx.sellerId}/products/${productId}/variants/${variantId}/stock`,
    );
    return {};
  } catch (err) {
    return { error: mapActionError(err, "updateVariantAction") };
  }
}

export async function addVariantAction(
  sellerId: string,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const productId = String(formData.get("productId") ?? "");
    await addVariant(getAppDb(), ctx, {
      productId,
      attributes: {},
      sellingPriceRupees: Number(formData.get("sellingPriceRupees")),
      mrpRupees: Number(formData.get("mrpRupees")),
      sku: String(formData.get("sku") ?? "") || undefined,
    });
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    return { error: mapActionError(err, "addVariantAction") };
  }
}

export async function archiveProductAction(
  sellerId: string,
  productId: string,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await archiveProduct(getAppDb(), ctx, productId);
    revalidateProduct(ctx.sellerId);
    redirect(`/s/${ctx.sellerId}/products`);
  } catch (err) {
    return { error: mapActionError(err, "archiveProductAction") };
  }
}

export async function archiveVariantAction(
  sellerId: string,
  productId: string,
  variantId: string,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await archiveVariant(getAppDb(), ctx, variantId);
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    return { error: mapActionError(err, "archiveVariantAction") };
  }
}

export async function activateProductAction(
  sellerId: string,
  productId: string,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await setProductStatus(getAppDb(), ctx, productId, "active");
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    if (err instanceof IncompleteProductError) {
      return {
        error: mapActionError(err, "activateProductAction"),
        missing: err.missing,
      };
    }
    return { error: mapActionError(err, "activateProductAction") };
  }
}

export async function requestImageUploadAction(
  sellerId: string,
  productId: string,
  input: { contentType: string; sizeBytes: number },
): Promise<
  | { uploadUrl: string; key: string }
  | { error: string }
> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const result = await requestImageUpload(
      getAppDb(),
      getObjectStorage(),
      ctx,
      productId,
      {
        contentType: input.contentType as "image/jpeg" | "image/png" | "image/webp",
        sizeBytes: input.sizeBytes,
      },
    );
    return { uploadUrl: result.uploadUrl, key: result.key };
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      notFound();
    }
    return { error: mapActionError(err, "requestImageUploadAction") };
  }
}

export async function confirmImageUploadAction(
  sellerId: string,
  productId: string,
  key: string,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await confirmImageUpload(
      getAppDb(),
      getObjectStorage(),
      getJobEnqueuer(),
      ctx,
      productId,
      key,
    );
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      notFound();
    }
    return { error: mapActionError(err, "confirmImageUploadAction") };
  }
}

export async function reorderImagesAction(
  sellerId: string,
  productId: string,
  orderedImageIds: string[],
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await reorderImages(getAppDb(), ctx, productId, orderedImageIds);
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    return { error: mapActionError(err, "reorderImagesAction") };
  }
}

export async function deleteImageAction(
  sellerId: string,
  productId: string,
  imageId: string,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    await deleteImage(
      getAppDb(),
      getObjectStorage(),
      ctx,
      productId,
      imageId,
    );
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      notFound();
    }
    return { error: mapActionError(err, "deleteImageAction") };
  }
}

export async function adjustStockAction(
  sellerId: string,
  productId: string,
  variantId: string,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSellerContext(sellerId);
  try {
    const delta = Number(formData.get("delta"));
    const reason = String(formData.get("reason") ?? "adjustment") as
      | "receive"
      | "adjustment";
    const clientRequestId = String(formData.get("clientRequestId") ?? "");
    const note = String(formData.get("note") ?? "") || undefined;
    await adjustStock(getAppDb(), ctx, variantId, {
      delta,
      reason,
      clientRequestId,
      note,
    });
    revalidatePath(
      `/s/${ctx.sellerId}/products/${productId}/variants/${variantId}/stock`,
    );
    revalidateProduct(ctx.sellerId, productId);
    return {};
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      notFound();
    }
    return { error: mapActionError(err, "adjustStockAction") };
  }
}
