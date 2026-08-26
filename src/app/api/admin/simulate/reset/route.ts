import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { roleSimulationEnabled } from "@/lib/view-context";
import { resetAllAssignments } from "@/db/queries/moves";

/**
 * Owner-only simulation control — clears every assignment across the
 * whole roster (all grades). Gated the same way as /api/admin/view-as.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!roleSimulationEnabled()) {
    return NextResponse.json({ error: "role_simulation_disabled" }, { status: 403 });
  }

  const result = await resetAllAssignments(actor.email);
  return NextResponse.json({ ok: true, ...result });
}
