import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { grantRole, revokeRole } from "@/db/queries/access";
import { getTripById } from "@/db/queries/trips";

const grantSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "staff_admin", "teacher"]),
  tripId: z.string().uuid().optional(),
});

/** Owner-only access-management UI, wired to the same grantRole/revokeRole used by the CLI. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = grantSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  let tripId: string | null = null;
  if (role === "teacher") {
    if (!parsed.data.tripId) {
      return NextResponse.json({ error: "teacher_requires_trip" }, { status: 400 });
    }
    const trip = await getTripById(parsed.data.tripId);
    if (!trip) {
      return NextResponse.json({ error: "trip_not_found" }, { status: 404 });
    }
    tripId = trip.id;
  }

  await grantRole(email, role, tripId, actor.email);
  return NextResponse.json({ ok: true });
}

const revokeSchema = z.object({ email: z.string().email() });

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = revokeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const revoked = await revokeRole(parsed.data.email.toLowerCase(), actor.email);
  if (!revoked) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
