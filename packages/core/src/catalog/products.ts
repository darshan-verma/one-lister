import {
  newId,
  productImages,
  products,
  variants,
  type Db,
  type Product,
  type Variant,
} from "@one-lister/db";
import { and, eq, isNull, sql } from "drizzle-orm";

import { writeAuditEvent } from "../audit/write-audit-event.js";
import {
  ConcurrentEditError,
  IncompleteProductError,
  ProductNotFoundError,
} from "../errors.js";
import { checkCompleteness } from "./completeness.js";
import {
  addVariantInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  updateVariantInputSchema,
  type AddVariantInput,
  type CreateProductInput,
  type UpdateProductInput,
  type UpdateVariantInput,
} from "./schemas.js";
import { cartesianOptions, dedupeSku, slugifyTitle, suggestSku } from "./sku.js";
import type { CatalogTenantContext, CompletenessResult } from "./types.js";

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

type SkuReader = {
  select: Db["select"];
};

async function loadSellerSkus(
  db: SkuReader,
  sellerId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ sku: variants.sku })
    .from(variants)
    .where(eq(variants.sellerId, sellerId));
  return new Set(rows.map((r) => r.sku.toUpperCase()));
}

async function requireProduct(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
  opts?: { includeDeleted?: boolean },
): Promise<Product> {
  const row = await db.query.products.findFirst({
    where: and(
      eq(products.id, productId),
      eq(products.sellerId, ctx.sellerId),
      opts?.includeDeleted ? undefined : isNull(products.deletedAt),
    ),
  });
  if (!row) {
    throw new ProductNotFoundError("product not found", {
      sellerId: ctx.sellerId,
      productId,
    });
  }
  return row;
}

async function requireVariant(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
  opts?: { includeDeleted?: boolean },
): Promise<Variant> {
  const row = await db.query.variants.findFirst({
    where: and(
      eq(variants.id, variantId),
      eq(variants.sellerId, ctx.sellerId),
      opts?.includeDeleted ? undefined : isNull(variants.deletedAt),
    ),
  });
  if (!row) {
    throw new ProductNotFoundError("variant not found", {
      sellerId: ctx.sellerId,
      variantId,
    });
  }
  return row;
}

export async function createProduct(
  db: Db,
  ctx: CatalogTenantContext,
  rawInput: CreateProductInput,
): Promise<{ product: Product; variants: Variant[] }> {
  const input = createProductInputSchema.parse(rawInput);

  if (input.sellingPriceRupees > input.mrpRupees) {
    throw new Error("Selling price cannot exceed MRP");
  }

  const optionCombos = cartesianOptions(input.options);
  const overrides = input.variants ?? [];

  return db.transaction(async (tx) => {
    const productId = newId();
    const slug = slugifyTitle(input.title);
    const existingSkus = await loadSellerSkus(tx, ctx.sellerId);

    const [product] = await tx
      .insert(products)
      .values({
        id: productId,
        sellerId: ctx.sellerId,
        title: input.title,
        description: input.description,
        brand: input.brand,
        hsnCode: input.hsnCode,
        gstRateBps: input.gstRateBps,
        countryOfOrigin: input.countryOfOrigin,
        attributes: {
          options: input.options,
        },
        status: "draft",
      })
      .returning();

    const createdVariants: Variant[] = [];

    for (let i = 0; i < optionCombos.length; i++) {
      const attrs = optionCombos[i] ?? {};
      const override =
        overrides.find((o) => {
          const keys = Object.keys(attrs);
          if (keys.length === 0 && Object.keys(o.attributes).length === 0) {
            return true;
          }
          return keys.every((k) => o.attributes[k] === attrs[k]);
        }) ?? overrides[i];

      const sellingPaise = override?.sellingPriceRupees ?? input.sellingPriceRupees;
      const mrpPaise = override?.mrpRupees ?? input.mrpRupees;
      if (sellingPaise > mrpPaise) {
        throw new Error("Selling price cannot exceed MRP");
      }

      const desiredSku =
        override?.sku?.toUpperCase() ?? suggestSku(slug, attrs);
      const sku = dedupeSku(desiredSku, existingSkus);

      const [variant] = await tx
        .insert(variants)
        .values({
          id: newId(),
          productId,
          sellerId: ctx.sellerId,
          sku,
          gtin: override?.gtin,
          mrpPaise,
          sellingPricePaise: sellingPaise,
          weightGrams: override?.weightGrams ?? input.weightGrams,
          lengthMm: override?.lengthMm ?? input.lengthMm,
          widthMm: override?.widthMm ?? input.widthMm,
          heightMm: override?.heightMm ?? input.heightMm,
          attributes: attrs,
          status: "draft",
        })
        .returning();

      createdVariants.push(variant!);
    }

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "product.create",
      targetType: "product",
      targetId: productId,
      metadata: {
        variantCount: createdVariants.length,
        title: input.title,
      },
    });

    return { product: product!, variants: createdVariants };
  });
}

export async function updateProduct(
  db: Db,
  ctx: CatalogTenantContext,
  rawInput: UpdateProductInput,
): Promise<Product> {
  const input = updateProductInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.sellerId, ctx.sellerId),
          isNull(products.deletedAt),
        ),
      )
      .for("update");

    const existing = locked[0];
    if (!existing) {
      throw new ProductNotFoundError("product not found", {
        sellerId: ctx.sellerId,
        productId: input.productId,
      });
    }

    if (!sameInstant(existing.updatedAt, input.updatedAt)) {
      throw new ConcurrentEditError("product was modified by someone else", {
        resource: "product",
        id: existing.id,
        expectedUpdatedAt: input.updatedAt,
        actualUpdatedAt: existing.updatedAt,
      });
    }

    const [updated] = await tx
      .update(products)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.hsnCode !== undefined ? { hsnCode: input.hsnCode } : {}),
        ...(input.gstRateBps !== undefined
          ? { gstRateBps: input.gstRateBps }
          : {}),
        ...(input.countryOfOrigin !== undefined
          ? { countryOfOrigin: input.countryOfOrigin }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(products.id, existing.id), eq(products.sellerId, ctx.sellerId)),
      )
      .returning();

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "product.update",
      targetType: "product",
      targetId: updated!.id,
    });

    return updated!;
  });
}

export async function updateVariant(
  db: Db,
  ctx: CatalogTenantContext,
  rawInput: UpdateVariantInput,
): Promise<Variant> {
  const input = updateVariantInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(variants)
      .where(
        and(
          eq(variants.id, input.variantId),
          eq(variants.sellerId, ctx.sellerId),
          isNull(variants.deletedAt),
        ),
      )
      .for("update");

    const existing = locked[0];
    if (!existing) {
      throw new ProductNotFoundError("variant not found", {
        sellerId: ctx.sellerId,
        variantId: input.variantId,
      });
    }

    if (!sameInstant(existing.updatedAt, input.updatedAt)) {
      throw new ConcurrentEditError("variant was modified by someone else", {
        resource: "variant",
        id: existing.id,
        expectedUpdatedAt: input.updatedAt,
        actualUpdatedAt: existing.updatedAt,
      });
    }

    const nextSelling =
      input.sellingPriceRupees ?? existing.sellingPricePaise;
    const nextMrp = input.mrpRupees ?? existing.mrpPaise;
    if (nextSelling > nextMrp) {
      throw new Error("Selling price cannot exceed MRP");
    }

    if (input.sku) {
      const clash = await tx.query.variants.findFirst({
        where: and(
          eq(variants.sellerId, ctx.sellerId),
          eq(variants.sku, input.sku.toUpperCase()),
          sql`${variants.id} <> ${existing.id}`,
        ),
        columns: { id: true },
      });
      if (clash) {
        throw new Error("SKU already in use");
      }
    }

    const [updated] = await tx
      .update(variants)
      .set({
        ...(input.sku !== undefined ? { sku: input.sku.toUpperCase() } : {}),
        ...(input.sellingPriceRupees !== undefined
          ? { sellingPricePaise: input.sellingPriceRupees }
          : {}),
        ...(input.mrpRupees !== undefined ? { mrpPaise: input.mrpRupees } : {}),
        ...(input.weightGrams !== undefined
          ? { weightGrams: input.weightGrams }
          : {}),
        ...(input.lengthMm !== undefined ? { lengthMm: input.lengthMm } : {}),
        ...(input.widthMm !== undefined ? { widthMm: input.widthMm } : {}),
        ...(input.heightMm !== undefined ? { heightMm: input.heightMm } : {}),
        ...(input.gtin !== undefined ? { gtin: input.gtin } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(variants.id, existing.id), eq(variants.sellerId, ctx.sellerId)),
      )
      .returning();

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "variant.update",
      targetType: "variant",
      targetId: updated!.id,
    });

    return updated!;
  });
}

export async function addVariant(
  db: Db,
  ctx: CatalogTenantContext,
  rawInput: AddVariantInput,
): Promise<Variant> {
  const input = addVariantInputSchema.parse(rawInput);
  const product = await requireProduct(db, ctx, input.productId);

  if (input.sellingPriceRupees > input.mrpRupees) {
    throw new Error("Selling price cannot exceed MRP");
  }

  const existingSkus = await loadSellerSkus(db, ctx.sellerId);
  const slug = slugifyTitle(product.title);
  const desiredSku =
    input.sku?.toUpperCase() ?? suggestSku(slug, input.attributes);
  const sku = dedupeSku(desiredSku, existingSkus);

  const [variant] = await db
    .insert(variants)
    .values({
      id: newId(),
      productId: product.id,
      sellerId: ctx.sellerId,
      sku,
      gtin: input.gtin,
      mrpPaise: input.mrpRupees,
      sellingPricePaise: input.sellingPriceRupees,
      weightGrams: input.weightGrams,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      attributes: input.attributes,
      status: "draft",
    })
    .returning();

  await writeAuditEvent(db, {
    sellerId: ctx.sellerId,
    actorUserId: ctx.userId,
    action: "variant.add",
    targetType: "variant",
    targetId: variant!.id,
  });

  return variant!;
}

export async function archiveVariant(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
): Promise<Variant> {
  const existing = await requireVariant(db, ctx, variantId);
  const now = new Date();
  const [updated] = await db
    .update(variants)
    .set({ deletedAt: now, status: "archived", updatedAt: now })
    .where(
      and(eq(variants.id, existing.id), eq(variants.sellerId, ctx.sellerId)),
    )
    .returning();

  await writeAuditEvent(db, {
    sellerId: ctx.sellerId,
    actorUserId: ctx.userId,
    action: "variant.archive",
    targetType: "variant",
    targetId: existing.id,
  });

  return updated!;
}

export async function archiveProduct(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
): Promise<Product> {
  const existing = await requireProduct(db, ctx, productId);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ deletedAt: now, status: "archived", updatedAt: now })
      .where(
        and(
          eq(products.id, existing.id),
          eq(products.sellerId, ctx.sellerId),
        ),
      )
      .returning();

    await tx
      .update(variants)
      .set({ deletedAt: now, status: "archived", updatedAt: now })
      .where(
        and(
          eq(variants.productId, existing.id),
          eq(variants.sellerId, ctx.sellerId),
          isNull(variants.deletedAt),
        ),
      );

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "product.archive",
      targetType: "product",
      targetId: existing.id,
    });

    return updated!;
  });
}

export async function getProductCompleteness(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
): Promise<CompletenessResult> {
  const product = await requireProduct(db, ctx, productId, {
    includeDeleted: true,
  });
  const productVariants = await db.query.variants.findMany({
    where: and(
      eq(variants.productId, productId),
      eq(variants.sellerId, ctx.sellerId),
    ),
  });
  const images = await db.query.productImages.findMany({
    where: and(
      eq(productImages.productId, productId),
      eq(productImages.sellerId, ctx.sellerId),
    ),
  });
  return checkCompleteness({ product, variants: productVariants, images });
}

export async function setProductStatus(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
  status: "active" | "draft",
): Promise<Product> {
  const product = await requireProduct(db, ctx, productId);

  if (status === "active") {
    const completeness = await getProductCompleteness(db, ctx, productId);
    if (!completeness.complete) {
      throw new IncompleteProductError(
        "product is incomplete",
        completeness.missing,
      );
    }
  }

  const [updated] = await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(products.id, product.id), eq(products.sellerId, ctx.sellerId)),
    )
    .returning();

  if (status === "active") {
    await db
      .update(variants)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(variants.productId, product.id),
          eq(variants.sellerId, ctx.sellerId),
          isNull(variants.deletedAt),
        ),
      );
  }

  await writeAuditEvent(db, {
    sellerId: ctx.sellerId,
    actorUserId: ctx.userId,
    action: "product.set_status",
    targetType: "product",
    targetId: product.id,
    metadata: { status },
  });

  return updated!;
}

export { requireProduct, requireVariant };
