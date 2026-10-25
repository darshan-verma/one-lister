import {
  newId,
  productImages,
  products,
  user,
  variants,
} from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConcurrentEditError,
  IncompleteProductError,
  ProductNotFoundError,
} from "../errors.js";
import { formatPaise, rupeesToPaise } from "../money.js";
import { createSeller } from "../sellers/create-seller.js";
import type { ObjectStorage } from "../storage/types.js";
import { confirmImageUpload, requestImageUpload } from "./images.js";
import {
  archiveProduct,
  createProduct,
  getProductCompleteness,
  setProductStatus,
  updateProduct,
} from "./products.js";
import { adjustStock, getVariantStock, setInitialStock } from "./stock.js";
import type { JobEnqueuer } from "./types.js";

function mockStorage(overrides: Partial<ObjectStorage> = {}): ObjectStorage {
  return {
    createUploadUrl: vi.fn(async ({ key }) => ({
      uploadUrl: `https://upload.test/${key}`,
      key,
      expiresAt: new Date(Date.now() + 300_000),
    })),
    headObject: vi.fn(async () => ({
      exists: true,
      contentType: "image/jpeg",
      contentLength: 1024,
    })),
    deleteObject: vi.fn(async () => undefined),
    getReadUrl: vi.fn(async ({ key }) => `https://read.test/${key}`),
    ...overrides,
  };
}

const jobs: JobEnqueuer = {
  enqueueImageProcess: vi.fn(async () => undefined),
};

describe("catalog", () => {
  let db: TestDb;
  let sellerA: { sellerId: string; userId: string };
  let sellerB: { sellerId: string; userId: string };

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "core" }));
  });

  beforeEach(async () => {
    await resetTestDb();

    const userA = `user_a_${newId()}`;
    const userB = `user_b_${newId()}`;
    await db.insert(user).values([
      {
        id: userA,
        name: "A",
        email: `a-${newId()}@example.com`,
        emailVerified: true,
      },
      {
        id: userB,
        name: "B",
        email: `b-${newId()}@example.com`,
        emailVerified: true,
      },
    ]);

    const a = await createSeller(db, {
      userId: userA,
      displayName: "Seller A",
      legalName: "Seller A Pvt Ltd",
    });
    const b = await createSeller(db, {
      userId: userB,
      displayName: "Seller B",
      legalName: "Seller B Pvt Ltd",
    });
    sellerA = { sellerId: a.sellerId, userId: userA };
    sellerB = { sellerId: b.sellerId, userId: userB };
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("tenant isolation: seller B cannot touch seller A product", async () => {
    const { product, variants: vs } = await createProduct(db, sellerA, {
      title: "Tee",
      sellingPriceRupees: 499,
      mrpRupees: 599,
    });

    await expect(
      updateProduct(db, sellerB, {
        productId: product.id,
        updatedAt: product.updatedAt,
        title: "Hacked",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    await expect(
      archiveProduct(db, sellerB, product.id),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    await expect(
      requestImageUpload(db, mockStorage(), sellerB, product.id, {
        contentType: "image/jpeg",
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    await expect(
      adjustStock(db, sellerB, vs[0]!.id, {
        delta: 1,
        reason: "receive",
        clientRequestId: newId(),
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    const still = await db.query.products.findFirst({
      where: eq(products.id, product.id),
    });
    expect(still?.title).toBe("Tee");
  });

  it("variant matrix: 3×2 → 6 unique SKUs; collision de-duped", async () => {
    await createProduct(db, sellerA, {
      title: "Shirt",
      sellingPriceRupees: 999,
      mrpRupees: 1299,
      variants: [{ attributes: {}, sku: "SHIRT-S-RED" }],
    });

    const { variants: vs } = await createProduct(db, sellerA, {
      title: "Shirt",
      sellingPriceRupees: 999,
      mrpRupees: 1299,
      options: [
        { name: "Size", values: ["S", "M", "L"] },
        { name: "Colour", values: ["Red", "Blue"] },
      ],
    });

    expect(vs).toHaveLength(6);
    const skus = vs.map((v) => v.sku);
    expect(new Set(skus).size).toBe(6);
    expect(skus).toContain("SHIRT-S-RED-2");
  });

  it("optimistic concurrency: second update with same updatedAt throws", async () => {
    const { product } = await createProduct(db, sellerA, {
      title: "Bag",
      sellingPriceRupees: 100,
      mrpRupees: 200,
    });

    const first = await updateProduct(db, sellerA, {
      productId: product.id,
      updatedAt: product.updatedAt,
      title: "Bag One",
    });

    await expect(
      updateProduct(db, sellerA, {
        productId: product.id,
        updatedAt: product.updatedAt,
        title: "Bag Two",
      }),
    ).rejects.toBeInstanceOf(ConcurrentEditError);

    const row = await db.query.products.findFirst({
      where: eq(products.id, product.id),
    });
    expect(row?.title).toBe(first.title);
  });

  it("completeness blocks activate until fields filled", async () => {
    const { product, variants: vs } = await createProduct(db, sellerA, {
      title: "Incomplete",
      sellingPriceRupees: 100,
      mrpRupees: 200,
    });

    const before = await getProductCompleteness(db, sellerA, product.id);
    expect(before.complete).toBe(false);
    expect(before.missing.some((m) => m.field === "description")).toBe(true);
    expect(before.missing.some((m) => m.field === "images")).toBe(true);

    await expect(
      setProductStatus(db, sellerA, product.id, "active"),
    ).rejects.toBeInstanceOf(IncompleteProductError);

    await updateProduct(db, sellerA, {
      productId: product.id,
      updatedAt: (
        await db.query.products.findFirst({ where: eq(products.id, product.id) })
      )!.updatedAt,
      description: "A nice product",
      brand: "BrandX",
      hsnCode: "6109",
      gstRateBps: 1800,
      countryOfOrigin: "IN",
    });

    await db.insert(productImages).values({
      id: newId(),
      sellerId: sellerA.sellerId,
      productId: product.id,
      s3Key: `sellers/${sellerA.sellerId}/products/${product.id}/x.jpg`,
      position: 0,
    });

    const v = vs[0]!;
    await db
      .update(variants)
      .set({
        weightGrams: 200,
        lengthMm: 100,
        widthMm: 80,
        heightMm: 20,
        updatedAt: new Date(),
      })
      .where(eq(variants.id, v.id));

    const after = await getProductCompleteness(db, sellerA, product.id);
    expect(after.complete).toBe(true);

    const activated = await setProductStatus(db, sellerA, product.id, "active");
    expect(activated.status).toBe("active");
  });

  it("images: confirm rejects bad key / content type; position increments", async () => {
    const { product } = await createProduct(db, sellerA, {
      title: "Img",
      sellingPriceRupees: 100,
      mrpRupees: 200,
    });
    const storage = mockStorage();

    await expect(
      confirmImageUpload(
        db,
        storage,
        jobs,
        sellerA,
        product.id,
        `sellers/${sellerB.sellerId}/products/${product.id}/evil.jpg`,
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    const badType = mockStorage({
      headObject: vi.fn(async () => ({
        exists: true,
        contentType: "application/pdf",
        contentLength: 100,
      })),
    });
    const prefix = `sellers/${sellerA.sellerId}/products/${product.id}/`;
    await expect(
      confirmImageUpload(
        db,
        badType,
        jobs,
        sellerA,
        product.id,
        `${prefix}a.jpg`,
      ),
    ).rejects.toThrow(/content type/i);

    const img1 = await confirmImageUpload(
      db,
      storage,
      jobs,
      sellerA,
      product.id,
      `${prefix}one.jpg`,
    );
    const img2 = await confirmImageUpload(
      db,
      storage,
      jobs,
      sellerA,
      product.id,
      `${prefix}two.jpg`,
    );
    expect(img1.position).toBe(0);
    expect(img2.position).toBe(1);
    expect(jobs.enqueueImageProcess).toHaveBeenCalled();
  });

  it("stock: adjustStock via ledger; same client uuid is idempotent", async () => {
    const { variants: vs } = await createProduct(db, sellerA, {
      title: "Stock",
      sellingPriceRupees: 100,
      mrpRupees: 200,
    });
    const variantId = vs[0]!.id;
    const clientRequestId = newId();

    await setInitialStock(db, sellerA, variantId, {
      quantity: 10,
      clientRequestId: newId(),
    });

    const first = await adjustStock(db, sellerA, variantId, {
      delta: 5,
      reason: "receive",
      clientRequestId,
    });
    expect(first.applied).toBe(true);

    const second = await adjustStock(db, sellerA, variantId, {
      delta: 5,
      reason: "receive",
      clientRequestId,
    });
    expect(second.applied).toBe(false);

    const stock = await getVariantStock(db, sellerA, variantId);
    expect(stock.onHand).toBe(15);
  });

  it("money: ₹1,299.50 → 129950 paise and formats back", async () => {
    expect(rupeesToPaise(1299.5)).toBe(129950);
    expect(formatPaise(129950)).toBe("₹1299.50");

    const { variants: vs } = await createProduct(db, sellerA, {
      title: "Money",
      sellingPriceRupees: 1299.5,
      mrpRupees: 1499.5,
    });
    expect(vs[0]!.sellingPricePaise).toBe(129950);
    expect(vs[0]!.mrpPaise).toBe(149950);
  });

  it("products without options get exactly one variant", async () => {
    const { variants: vs } = await createProduct(db, sellerA, {
      title: "Simple",
      sellingPriceRupees: 50,
      mrpRupees: 60,
    });
    expect(vs).toHaveLength(1);
  });
});
