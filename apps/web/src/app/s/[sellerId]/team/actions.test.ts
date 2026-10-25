import { createSeller } from "@one-lister/core";
import {
  newId,
  sellerInvitations,
  sellerMembers,
  user,
} from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/server/auth";

const { requireUserMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn<() => Promise<SessionUser>>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url}`;
    throw err;
  },
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  },
}));

vi.mock("@/server/auth/session", () => ({
  requireUser: () => requireUserMock(),
  getSession: async () => {
    const u = await requireUserMock();
    return { user: u, session: { id: "test-session", userId: u.id } };
  },
}));

vi.mock("@/lib/db", () => ({
  getAppDb: () => {
    // Resolved in beforeAll once the shared test pool is ready.
    if (!testDbRef.db) {
      throw new Error("test db not ready");
    }
    return testDbRef.db;
  },
}));

vi.mock("@/lib/email", () => ({
  getEmailSender: () => ({
    send: vi.fn(async () => undefined),
  }),
}));

const testDbRef: { db: TestDb | null } = { db: null };

// Import after mocks so requireSellerContext uses mocked requireUser / navigation.
const { inviteMemberAction } = await import("./actions");

function asSessionUser(
  partial: Pick<SessionUser, "id" | "email" | "emailVerified"> & {
    platformRole?: SessionUser["platformRole"];
    name?: string;
  },
): SessionUser {
  return {
    id: partial.id,
    email: partial.email,
    emailVerified: partial.emailVerified,
    name: partial.name ?? partial.email,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    platformRole: partial.platformRole ?? null,
  } as SessionUser;
}

async function seedUser(
  db: TestDb,
  opts: {
    email: string;
    emailVerified?: boolean;
    platformRole?: "ops_agent" | "admin" | null;
  },
) {
  const id = `user_${opts.email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({
    id,
    name: opts.email,
    email: opts.email,
    emailVerified: opts.emailVerified ?? true,
    platformRole: opts.platformRole ?? null,
  });
  return id;
}

function inviteForm(email = "new@example.com", role = "staff"): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("role", role);
  return fd;
}

describe("inviteMemberAction authorization", () => {
  let db: TestDb;

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "web" }));
    testDbRef.db = db;
  });

  beforeEach(async () => {
    await resetTestDb();
    requireUserMock.mockReset();
  });

  afterAll(async () => {
    await closeTestDb();
    testDbRef.db = null;
  });

  async function setupTwoSellers() {
    const ownerA = await seedUser(db, { email: "owner-a@example.com" });
    const staffA = await seedUser(db, { email: "staff-a@example.com" });
    const ownerB = await seedUser(db, { email: "owner-b@example.com" });

    const sellerA = await createSeller(db, {
      userId: ownerA,
      displayName: "Seller A",
      legalName: "Seller A Pvt",
    });
    const sellerB = await createSeller(db, {
      userId: ownerB,
      displayName: "Seller B",
      legalName: "Seller B Pvt",
    });

    await db.insert(sellerMembers).values({
      id: newId(),
      sellerId: sellerA.sellerId,
      userId: staffA,
      role: "staff",
    });

    return { ownerA, staffA, ownerB, sellerA, sellerB };
  }

  it("rejects a staff member of that seller — no invitation row written", async () => {
    const { staffA, sellerA } = await setupTwoSellers();
    requireUserMock.mockResolvedValue(
      asSessionUser({
        id: staffA,
        email: "staff-a@example.com",
        emailVerified: true,
      }),
    );

    await expect(
      inviteMemberAction(sellerA.sellerId, {}, inviteForm()),
    ).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });

    const rows = await db.query.sellerInvitations.findMany({
      where: (t, { eq }) => eq(t.sellerId, sellerA.sellerId),
    });
    expect(rows).toHaveLength(0);

    const all = await db.select().from(sellerInvitations);
    expect(all).toHaveLength(0);
  });

  it("rejects a member of a different seller — no invitation row written", async () => {
    const { ownerB, sellerA, sellerB } = await setupTwoSellers();
    requireUserMock.mockResolvedValue(
      asSessionUser({
        id: ownerB,
        email: "owner-b@example.com",
        emailVerified: true,
      }),
    );

    // ownerB is owner of sellerB, not sellerA → notFound (never 403)
    await expect(
      inviteMemberAction(sellerA.sellerId, {}, inviteForm()),
    ).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });

    const forA = await db.query.sellerInvitations.findMany({
      where: (t, { eq }) => eq(t.sellerId, sellerA.sellerId),
    });
    const forB = await db.query.sellerInvitations.findMany({
      where: (t, { eq }) => eq(t.sellerId, sellerB.sellerId),
    });
    expect(forA).toHaveLength(0);
    expect(forB).toHaveLength(0);
  });
});
