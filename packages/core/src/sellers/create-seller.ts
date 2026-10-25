import {
  newId,
  sellerMembers,
  sellers,
  stockLocations,
  type Db,
} from "@one-lister/db";
import { z } from "zod";

import { writeAuditEvent } from "../audit/write-audit-event.js";
import { GSTIN_REGEX } from "./gstin.js";

const createSellerInputSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(300),
  gstin: z.string().optional(),
});

export type CreateSellerInput = {
  userId: string;
  displayName: string;
  legalName: string;
  gstin?: string;
};

export type CreateSellerResult = {
  sellerId: string;
  locationId: string;
  memberId: string;
};

/**
 * Create a seller with owner membership + default stock location + audit event
 * in a single transaction. Rolls back entirely on any failure.
 */
export async function createSeller(
  db: Db,
  rawInput: CreateSellerInput,
): Promise<CreateSellerResult> {
  const parsed = createSellerInputSchema.parse(rawInput);
  const gstinRaw = parsed.gstin?.trim().toUpperCase();
  const gstin =
    gstinRaw === undefined || gstinRaw === "" ? undefined : gstinRaw;
  if (gstin !== undefined && !GSTIN_REGEX.test(gstin)) {
    throw new Error("invalid GSTIN format");
  }

  const input = {
    userId: parsed.userId,
    displayName: parsed.displayName.trim(),
    legalName: parsed.legalName.trim(),
    gstin,
  };

  return db.transaction(async (tx) => {
    const sellerId = newId();
    const locationId = newId();
    const memberId = newId();

    await tx.insert(sellers).values({
      id: sellerId,
      displayName: input.displayName,
      legalName: input.legalName,
      gstin: input.gstin,
      status: "active",
    });

    await tx.insert(sellerMembers).values({
      id: memberId,
      sellerId,
      userId: input.userId,
      role: "owner",
    });

    await tx.insert(stockLocations).values({
      id: locationId,
      sellerId,
      name: "Default",
      isDefault: true,
    });

    await writeAuditEvent(tx, {
      sellerId,
      actorUserId: input.userId,
      action: "seller.created",
      targetType: "seller",
      targetId: sellerId,
      metadata: {
        displayName: input.displayName,
        legalName: input.legalName,
        hasGstin: Boolean(input.gstin),
      },
    });

    return { sellerId, locationId, memberId };
  });
}
