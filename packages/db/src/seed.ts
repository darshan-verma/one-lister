/**
 * Idempotent demo seed for local development.
 * Does NOT insert inventory — that goes through the ledger in a later step.
 */
import { and, eq, isNull } from "drizzle-orm";

import { createDb } from "./client.js";
import { newId } from "./id.js";
import {
  channelAccounts,
  products,
  sellers,
  stockLocations,
  variants,
} from "./schema/index.js";

const SEED_SELLER_DISPLAY_NAME = "Demo Textiles Jaipur";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (set in root .env)");
  }

  const { db, sql } = createDb(databaseUrl);

  try {
    const existingSeller = await db.query.sellers.findFirst({
      where: eq(sellers.displayName, SEED_SELLER_DISPLAY_NAME),
    });

    const sellerId = existingSeller?.id ?? newId();

    if (!existingSeller) {
      await db.insert(sellers).values({
        id: sellerId,
        displayName: SEED_SELLER_DISPLAY_NAME,
        legalName: "Demo Textiles Private Limited",
        gstin: "08AABCD1234E1Z5",
        status: "active",
      });
      console.log(`Created seller ${sellerId}`);
    } else {
      console.log(`Seller already exists ${sellerId}`);
    }

    const existingLocation = await db.query.stockLocations.findFirst({
      where: and(
        eq(stockLocations.sellerId, sellerId),
        eq(stockLocations.isDefault, true),
      ),
    });

    if (!existingLocation) {
      await db.insert(stockLocations).values({
        id: newId(),
        sellerId,
        name: "Jaipur Warehouse",
        isDefault: true,
        address: {
          line1: "Plot 12, Sitapura Industrial Area",
          city: "Jaipur",
          state: "Rajasthan",
          pincode: "302022",
          country: "IN",
        },
      });
      console.log("Created default stock location");
    } else {
      console.log("Default stock location already exists");
    }

    for (const marketplace of ["amazon", "flipkart"] as const) {
      const existingAccount = await db.query.channelAccounts.findFirst({
        where: and(
          eq(channelAccounts.sellerId, sellerId),
          eq(channelAccounts.marketplace, marketplace),
          isNull(channelAccounts.externalSellerId),
        ),
      });

      if (!existingAccount) {
        await db.insert(channelAccounts).values({
          id: newId(),
          sellerId,
          marketplace,
          status: "pending_auth",
          integrationMode: "api",
          defaultSafetyBuffer: 2,
        });
        console.log(`Created ${marketplace} channel account`);
      } else {
        console.log(`${marketplace} channel account already exists`);
      }
    }

    const catalog = [
      {
        title: "Handloom Cotton Kurta",
        description:
          "Breathable handloom cotton kurta for everyday wear. Machine wash cold.",
        brand: "Jaipur Loom",
        hsnCode: "62052000",
        gstRateBps: 500,
        attributes: { fabric: "cotton", weave: "handloom", fit: "regular" },
        skus: [
          {
            sku: "JL-KURTA-WHT-M",
            gtin: "8901001123456",
            mrpPaise: 149_900,
            sellingPricePaise: 999_00,
            weightGrams: 280,
            lengthMm: 320,
            widthMm: 240,
            heightMm: 40,
            attributes: { size: "M", colour: "White" },
          },
          {
            sku: "JL-KURTA-WHT-L",
            gtin: "8901001123457",
            mrpPaise: 149_900,
            sellingPricePaise: 999_00,
            weightGrams: 300,
            lengthMm: 330,
            widthMm: 250,
            heightMm: 40,
            attributes: { size: "L", colour: "White" },
          },
          {
            sku: "JL-KURTA-BLU-M",
            gtin: "8901001123458",
            mrpPaise: 159_900,
            sellingPricePaise: 1_099_00,
            weightGrams: 280,
            lengthMm: 320,
            widthMm: 240,
            heightMm: 40,
            attributes: { size: "M", colour: "Indigo" },
          },
        ],
      },
      {
        title: "Block Print Cotton Dupatta",
        description: "Sanganeri block-print cotton dupatta. Lightweight summer layer.",
        brand: "Jaipur Loom",
        hsnCode: "62142000",
        gstRateBps: 500,
        attributes: { fabric: "cotton", print: "sanganeri" },
        skus: [
          {
            sku: "JL-DUP-RED",
            gtin: null,
            mrpPaise: 799_00,
            sellingPricePaise: 549_00,
            weightGrams: 150,
            lengthMm: 280,
            widthMm: 200,
            heightMm: 30,
            attributes: { colour: "Red", length_cm: 225 },
          },
          {
            sku: "JL-DUP-GRN",
            gtin: null,
            mrpPaise: 799_00,
            sellingPricePaise: 549_00,
            weightGrams: 150,
            lengthMm: 280,
            widthMm: 200,
            heightMm: 30,
            attributes: { colour: "Green", length_cm: 225 },
          },
        ],
      },
      {
        title: "Brass Diya Set (Pack of 4)",
        description:
          "Handcrafted brass diyas for festivals and gifting. Food-safe lacquer finish.",
        brand: "Moradabad Metalworks",
        hsnCode: "74198030",
        gstRateBps: 1800,
        attributes: { material: "brass", pack_size: 4 },
        skus: [
          {
            sku: "MM-DIYA-4PK-STD",
            gtin: "8902002234567",
            mrpPaise: 999_00,
            sellingPricePaise: 749_00,
            weightGrams: 420,
            lengthMm: 180,
            widthMm: 180,
            heightMm: 80,
            attributes: { finish: "antique" },
          },
          {
            sku: "MM-DIYA-4PK-POL",
            gtin: "8902002234568",
            mrpPaise: 1_199_00,
            sellingPricePaise: 899_00,
            weightGrams: 420,
            lengthMm: 180,
            widthMm: 180,
            heightMm: 80,
            attributes: { finish: "polished" },
          },
        ],
      },
    ] as const;

    for (const product of catalog) {
      const existingProduct = await db.query.products.findFirst({
        where: and(eq(products.sellerId, sellerId), eq(products.title, product.title)),
      });

      const productId = existingProduct?.id ?? newId();

      if (!existingProduct) {
        await db.insert(products).values({
          id: productId,
          sellerId,
          title: product.title,
          description: product.description,
          brand: product.brand,
          hsnCode: product.hsnCode,
          gstRateBps: product.gstRateBps,
          countryOfOrigin: "IN",
          attributes: product.attributes,
          status: "active",
        });
        console.log(`Created product ${product.title}`);
      } else {
        console.log(`Product already exists: ${product.title}`);
      }

      for (const sku of product.skus) {
        const existingVariant = await db.query.variants.findFirst({
          where: and(eq(variants.sellerId, sellerId), eq(variants.sku, sku.sku)),
        });

        if (!existingVariant) {
          await db.insert(variants).values({
            id: newId(),
            productId,
            sellerId,
            sku: sku.sku,
            gtin: sku.gtin,
            mrpPaise: sku.mrpPaise,
            sellingPricePaise: sku.sellingPricePaise,
            weightGrams: sku.weightGrams,
            lengthMm: sku.lengthMm,
            widthMm: sku.widthMm,
            heightMm: sku.heightMm,
            attributes: sku.attributes,
            status: "active",
          });
          console.log(`  Created variant ${sku.sku}`);
        } else {
          console.log(`  Variant already exists: ${sku.sku}`);
        }
      }
    }

    console.log("Seed complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
