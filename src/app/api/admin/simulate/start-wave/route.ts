import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { roleSimulationEnabled } from "@/lib/view-context";
import { startWaveNow } from "@/db/queries/waves";

const bodySchema = z.object({ wave: z.number().int().min(1).max(4) });

/**
 * Owner-only simulation control (src/app/admin/simulation-panel.tsx) —
 * opens a wave right now for testing. Gated the same way as
 * /api/admin/view-as: real owner + ROLE_SIMULATION_ENABLED.
 */
export async function POST(request: Request) {
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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await startWaveNow(parsed.data.wave, actor.email);
  return NextResponse.json({ ok: true, ...result });
}
