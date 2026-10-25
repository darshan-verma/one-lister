import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe — no dependency checks (safe for the load balancer). */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
