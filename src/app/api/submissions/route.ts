import { NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { getRosterByEmail } from "@/db/queries/roster";
import { getWaveScheduleForGrade, isWindowOpen } from "@/db/queries/waves";
import { getSubmissionForStudent, upsertSubmission } from "@/db/queries/submissions";

/**
 * ~100-150 fake students (§13) can't have real Google accounts, so the load
 * test needs a way to submit as a given roster email without a Google OAuth
 * session. This bypass only activates when SIMULATION_SECRET is set AND the
 * caller supplies it — it must be unset (or the deployment redeployed
 * without it) before any real student data is loaded, since it is
 * deliberately an auth bypass. Wave-gating and every other check below still
 * apply in full; only identity resolution changes.
 */
function resolveIdentity(request: Request, session: { user?: { email?: string | null } } | null): string | null {
  const simulationSecret = process.env.SIMULATION_SECRET;
  if (simulationSecret && request.headers.get("x-simulation-secret") === simulationSecret) {
    return request.headers.get("x-simulation-email");
  }
  return session?.user?.email ?? null;
}

export async function GET(request: Request) {
  const session = await auth();
  const email = resolveIdentity(request, session);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [submission, rosterRow] = await Promise.all([
    getSubmissionForStudent(email),
    getRosterByEmail(email),
  ]);

  if (!rosterRow) {
    return NextResponse.json({ submission, waveOpen: false, grade: null });
  }

  const wave = await getWaveScheduleForGrade(rosterRow.grade);
  return NextResponse.json({
    submission,
    waveOpen: isWindowOpen(wave),
    grade: rosterRow.grade,
    closesAt: wave?.closesAt ?? null,
  });
}

const bodySchema = z.discriminatedUnion("optedOut", [
  z.object({ optedOut: z.literal(true) }),
  z.object({
    optedOut: z.literal(false),
    choices: z.array(z.string().uuid()).length(4),
  }),
]);

export async function POST(request: Request) {
  const session = await auth();
  const email = resolveIdentity(request, session);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Only students (present on the roster) submit rankings — admin/teacher
  // accounts aren't on the roster at all (see the auth.ts admin bypass).
  const rosterRow = await getRosterByEmail(email);
  if (!rosterRow) {
    return NextResponse.json(
      { error: "not_a_student" },
      { status: 403 },
    );
  }

  // Wave-gating enforced here, server-side — not just hidden in the UI
  // (§5, §12 step 5).
  const wave = await getWaveScheduleForGrade(rosterRow.grade);
  if (!isWindowOpen(wave)) {
    return NextResponse.json(
      { error: "wave_not_open", grade: rosterRow.grade },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.optedOut) {
    await upsertSubmission(email, {
      optedOut: true,
      tripChoice1: null,
      tripChoice2: null,
      tripChoice3: null,
      tripChoice4: null,
    });
    return NextResponse.json({ ok: true });
  }

  const { choices } = parsed.data;
  if (new Set(choices).size !== 4) {
    return NextResponse.json(
      { error: "duplicate_choices" },
      { status: 400 },
    );
  }

  const existingTrips = await db
    .select({ id: trips.id })
    .from(trips)
    .where(inArray(trips.id, choices));
  if (existingTrips.length !== 4) {
    return NextResponse.json({ error: "invalid_trip_id" }, { status: 400 });
  }

  await upsertSubmission(email, {
    optedOut: false,
    tripChoice1: choices[0],
    tripChoice2: choices[1],
    tripChoice3: choices[2],
    tripChoice4: choices[3],
  });
  return NextResponse.json({ ok: true });
}
