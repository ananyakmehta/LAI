import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnAssignment } from "@/db/queries/assignments";
import { getTripById } from "@/db/queries/trips";
import { getWaiverAcknowledgment, setWaiverAcknowledgment } from "@/db/queries/waivers";
import { resolveStudentIdentity } from "@/lib/student-identity";

export async function GET(request: Request) {
  const identity = await resolveStudentIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const assignment = await getOwnAssignment(identity.email);
  if (!assignment) {
    return NextResponse.json({ assignment: null });
  }

  const trip = await getTripById(assignment.tripId);
  if (!trip) {
    return NextResponse.json({ assignment: null });
  }

  const acknowledgment = trip.waiverRequired
    ? await getWaiverAcknowledgment(identity.email, trip.id)
    : null;

  return NextResponse.json({
    assignment: {
      tripName: trip.name,
      waiverRequired: trip.waiverRequired,
      waiverUrl: trip.waiverUrl,
      waiverDescription: trip.waiverDescription,
      acknowledged: acknowledgment !== null,
    },
  });
}

const postSchema = z.object({ acknowledged: z.boolean() });

export async function POST(request: Request) {
  const identity = await resolveStudentIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const assignment = await getOwnAssignment(identity.email);
  if (!assignment) {
    return NextResponse.json({ error: "not_assigned" }, { status: 403 });
  }

  const trip = await getTripById(assignment.tripId);
  if (!trip?.waiverRequired) {
    return NextResponse.json({ error: "no_waiver_required" }, { status: 400 });
  }

  await setWaiverAcknowledgment(identity.email, trip.id, parsed.data.acknowledged);
  return NextResponse.json({ ok: true });
}
