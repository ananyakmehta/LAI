import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { getRosterByEmail } from "@/db/queries/roster";
import { getTripFillStatus, moveStudentToTrip } from "@/db/queries/moves";

const bodySchema = z.object({
  email: z.string().email(),
  tripId: z.string().uuid(),
  force: z.boolean().optional(),
});

/**
 * The web-UI counterpart to the CLI's `move-student` — same shared
 * validated/logged path (src/db/queries/moves.ts), just a second front
 * door. Owner-only (§6: "Move any student, any trip" is owner ✅ only).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const actor = await getActor(session.user.email);
  if (!can.moveAnyStudent(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const { tripId, force } = parsed.data;

  const studentRow = await getRosterByEmail(email);
  if (!studentRow) {
    return NextResponse.json({ error: "not_on_roster" }, { status: 404 });
  }

  const status = await getTripFillStatus(tripId);
  if (!status) {
    return NextResponse.json({ error: "trip_not_found" }, { status: 404 });
  }

  if (status.filled >= status.trip.capacity && !force) {
    return NextResponse.json(
      {
        error: "capacity_exceeded",
        needsConfirmation: true,
        filled: status.filled,
        capacity: status.trip.capacity,
        tripName: status.trip.name,
      },
      { status: 409 },
    );
  }

  const { fromTripId } = await moveStudentToTrip(email, tripId, actor.email);
  return NextResponse.json({ ok: true, tripName: status.trip.name, fromTripId });
}
