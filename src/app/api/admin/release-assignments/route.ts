import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { releaseAssignments } from "@/db/queries/event-config";

/**
 * Owner-only: the deliberate reveal step. Sorting itself already ran
 * (per-wave, automatically or via the simulation panel) — this is what
 * actually makes assignments visible to students, all grades at once.
 * Not gated on ROLE_SIMULATION_ENABLED: this is real event-day
 * functionality, not a testing shortcut.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (!can.releaseAssignments(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await releaseAssignments(actor.email);
  return NextResponse.json({ ok: true, ...result });
}
