import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import {
  VIEW_AS_COOKIE,
  roleSimulationEnabled,
  validateSimulationTarget,
  type SimulationTarget,
} from "@/lib/view-context";

const bodySchema = z.object({
  role: z.enum(["student", "teacher", "staff_admin"]),
  email: z.string().email().optional(),
  tripId: z.string().uuid().optional(),
  timePhase: z.enum(["before", "during", "after"]).optional(),
});

/**
 * Starts a "view as" simulation. Gated on the REAL actor being owner —
 * this is a separate, independent check from the ROLE_SIMULATION_ENABLED
 * flag (that flag controls whether this is ever offered; this check is
 * the actual authorization, same as every other admin route).
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

  const target: SimulationTarget = {
    role: parsed.data.role,
    email: parsed.data.email?.toLowerCase(),
    tripId: parsed.data.tripId,
    timePhase: parsed.data.role === "student" ? (parsed.data.timePhase ?? "during") : undefined,
  };

  const validationError = await validateSimulationTarget(target);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const store = await cookies();
  store.set(VIEW_AS_COOKIE, JSON.stringify(target), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  return NextResponse.json({ ok: true });
}
