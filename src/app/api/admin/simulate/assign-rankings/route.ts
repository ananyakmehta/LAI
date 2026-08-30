import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { roleSimulationEnabled } from "@/lib/view-context";
import { getRosterByGrade } from "@/db/queries/roster";
import { shuffle, weightedSampleWithoutReplacement } from "@/lib/weighted-sample";
import { submitSimulatedRanking } from "@/lib/simulate-submission";

const bodySchema = z.object({
  grade: z.enum(["senior", "junior", "sophomore", "freshman"]),
  nonResponderCount: z.number().int().min(0).default(0),
  optOutCount: z.number().int().min(0).default(0),
  weights: z.record(z.string(), z.number().min(0)).optional(),
});

/**
 * Owner-only simulation control — generates a weighted-random set of 4
 * rankings for every student in a grade (minus a chosen number of random
 * non-responders) and submits them through submitSimulatedRanking, which
 * hits the REAL /api/submissions route (real validation, real wave-gating)
 * rather than writing to the DB directly. A student whose grade's wave
 * isn't currently open will correctly fail here with wave_not_open — same
 * as a real premature submission would. Gated the same way as
 * /api/admin/view-as.
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
  const { grade, nonResponderCount, optOutCount, weights } = parsed.data;

  const allTrips = await db.select({ id: trips.id, name: trips.name }).from(trips);
  if (allTrips.length < 4) {
    return NextResponse.json({ error: "need_at_least_4_trips" }, { status: 400 });
  }
  const weightedTrips = allTrips.map((t) => ({ item: t, weight: weights?.[t.id] ?? 1 }));

  const gradeStudents = await getRosterByGrade(grade);
  if (gradeStudents.length === 0) {
    return NextResponse.json({ error: "no_students_in_grade" }, { status: 400 });
  }

  const shuffled = shuffle(gradeStudents);
  const clampedNonResponders = Math.min(nonResponderCount, shuffled.length);
  const nonResponders = new Set(shuffled.slice(0, clampedNonResponders).map((s) => s.email));

  const remaining = shuffled.slice(clampedNonResponders);
  const clampedOptOuts = Math.min(optOutCount, remaining.length);
  const optedOut = new Set(remaining.slice(0, clampedOptOuts).map((s) => s.email));

  const submitters = remaining.slice(clampedOptOuts);

  const origin = new URL(request.url).origin;
  const results = await Promise.all([
    ...[...optedOut].map(async (email) => {
      const result = await submitSimulatedRanking(origin, email, { optedOut: true });
      return { email, ...result };
    }),
    ...submitters.map(async (s) => {
      const choices = weightedSampleWithoutReplacement(weightedTrips, 4).map((t) => t.id);
      const result = await submitSimulatedRanking(origin, s.email, { optedOut: false, choices });
      return { email: s.email, ...result };
    }),
  ]);
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: true,
    grade,
    attempted: submitters.length + optedOut.size,
    submitted: results.length - failed.length,
    nonResponders: [...nonResponders],
    optedOut: [...optedOut],
    failed: failed.map((f) => ({ email: f.email, status: f.status, error: f.error })),
  });
}
