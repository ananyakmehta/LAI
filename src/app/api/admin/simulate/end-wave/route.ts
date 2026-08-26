import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { roleSimulationEnabled } from "@/lib/view-context";
import { endWaveNow } from "@/db/queries/waves";

const bodySchema = z.object({ wave: z.number().int().min(1).max(4) });

/**
 * Owner-only simulation control — closes a wave now (with a short buffer,
 * see endWaveNow's doc comment). Gated the same way as /api/admin/view-as.
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

  try {
    const result = await endWaveNow(parsed.data.wave, actor.email);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 },
    );
  }
}
