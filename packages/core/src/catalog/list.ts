import {
  inventoryLevels,
  productImages,
  products,
  variants,
  type Db,
  type Product,
} from "@one-lister/db";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { CatalogTenantContext } from "./types.js";

export type ProductListItem = {
  product: Product;
  variantCount: number;
  totalStock: number;
  thumbnailKey: string | null;
};

const listFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export type ListProductsInput = z.input<typeof listFiltersSchema>;

export async function listProducts(
  db: Db,
  ctx: CatalogTenantContext,
  rawInput: ListProductsInput = {},
): Promise<{ items: ProductListItem[]; nextCursor: string | null }> {
  const input = listFiltersSchema.parse(rawInput);
  const limit = input.limit;

  let cursor: { createdAt: string; id: string } | undefined;
  if (input.cursor) {
    cursor = JSON.parse(
      Buffer.from(input.cursor, "base64url").toString("utf8"),
    ) as { createdAt: string; id: string };
  }

  const conditions = [eq(products.sellerId, ctx.sellerId)];

  if (input.status === "archived") {
    conditions.push(isNotNull(products.deletedAt));
  } else if (input.status) {
    conditions.push(isNull(products.deletedAt));
    conditions.push(eq(products.status, input.status));
  } else {
    conditions.push(isNull(products.deletedAt));
  }

  if (input.search && input.search.length > 0) {
    const pattern = `%${input.search}%`;
    const matchingVariantProductIds = db
      .selectDistinct({ productId: variants.productId })
      .from(variants)
      .where(
        and(
          eq(variants.sellerId, ctx.sellerId),
          ilike(variants.sku, pattern),
        ),
      );

    conditions.push(
      or(
        ilike(products.title, pattern),
        inArray(products.id, matchingVariantProductIds),
      )!,
    );
  }

  if (cursor) {
    const createdAt = new Date(cursor.createdAt);
    conditions.push(
      sql`(${products.createdAt}, ${products.id}) < (${createdAt}, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const productIds = page.map((p) => p.id);

  const variantCounts = new Map<string, number>();
  const stockByProduct = new Map<string, number>();
  const thumbByProduct = new Map<string, string>();

  if (productIds.length > 0) {
    const variantRows = await db
      .select({
        productId: variants.productId,
        id: variants.id,
      })
      .from(variants)
      .where(
        and(
          eq(variants.sellerId, ctx.sellerId),
          inArray(variants.productId, productIds),
          isNull(variants.deletedAt),
        ),
      );

    for (const v of variantRows) {
      variantCounts.set(v.productId, (variantCounts.get(v.productId) ?? 0) + 1);
    }

    const variantIds = variantRows.map((v) => v.id);
    if (variantIds.length > 0) {
      const levels = await db
        .select({
          variantId: inventoryLevels.variantId,
          onHand: inventoryLevels.onHand,
        })
        .from(inventoryLevels)
        .where(
          and(
            eq(inventoryLevels.sellerId, ctx.sellerId),
            inArray(inventoryLevels.variantId, variantIds),
          ),
        );

      const variantToProduct = new Map(
        variantRows.map((v) => [v.id, v.productId]),
      );
      for (const level of levels) {
        const productId = variantToProduct.get(level.variantId);
        if (!productId) continue;
        stockByProduct.set(
          productId,
          (stockByProduct.get(productId) ?? 0) + level.onHand,
        );
      }
    }

    const images = await db
      .select({
        productId: productImages.productId,
        s3Key: productImages.s3Key,
        position: productImages.position,
      })
      .from(productImages)
      .where(
        and(
          eq(productImages.sellerId, ctx.sellerId),
          inArray(productImages.productId, productIds),
        ),
      )
      .orderBy(productImages.position);

    for (const img of images) {
      if (!thumbByProduct.has(img.productId)) {
        thumbByProduct.set(img.productId, img.s3Key);
      }
    }
  }

  const items: ProductListItem[] = page.map((product) => ({
    product,
    variantCount: variantCounts.get(product.id) ?? 0,
    totalStock: stockByProduct.get(product.id) ?? 0,
    thumbnailKey: thumbByProduct.get(product.id) ?? null,
  }));

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          }),
          "utf8",
        ).toString("base64url")
      : null;

  return { items, nextCursor };
}

export async function getProductDetail(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
) {
  const product = await db.query.products.findFirst({
    where: and(
      eq(products.id, productId),
      eq(products.sellerId, ctx.sellerId),
      isNull(products.deletedAt),
    ),
  });
  if (!product) return null;

  const productVariants = await db.query.variants.findMany({
    where: and(
      eq(variants.productId, productId),
      eq(variants.sellerId, ctx.sellerId),
      isNull(variants.deletedAt),
    ),
  });

  const images = await db.query.productImages.findMany({
    where: and(
      eq(productImages.productId, productId),
      eq(productImages.sellerId, ctx.sellerId),
    ),
    orderBy: [productImages.position],
  });

  return { product, variants: productVariants, images };
}
