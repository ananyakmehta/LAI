import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, changeLog, submissions, trips, waveSchedule } from "@/db/schema";

export async function getTripFillStatus(tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return null;
  const current = await db.select().from(assignments).where(eq(assignments.tripId, tripId));
  return { trip, filled: current.length };
}

/**
 * The one shared move implementation — used by both the CLI's
 * `move-student` and the admin dashboard's move UI, so there's exactly one
 * code path that writes an assignment + change_log row for a manual move
 * (§4's "how the assignment happened" guarantee doesn't hold if two
 * surfaces can each mutate this independently).
 */
export async function moveStudentToTrip(
  email: string,
  tripId: string,
  who: string,
): Promise<{ fromTripId: string | null }> {
  const [existing] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.studentEmail, email))
    .limit(1);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.delete(assignments).where(eq(assignments.studentEmail, email));
    }
    await tx.insert(assignments).values({
      studentEmail: email,
      tripId,
      assignmentMethod: "manual_admin_override",
    });
    await tx.insert(changeLog).values({
      who,
      action: "move_student",
      studentEmail: email,
      fromTrip: existing?.tripId ?? null,
      toTrip: tripId,
    });
  });

  return { fromTripId: existing?.tripId ?? null };
}

/**
 * Owner-only simulation control (src/app/admin/simulation-panel.tsx):
 * clears every assignment AND every submission across the whole roster —
 * all grades, all trips — and resets sortedAt on every wave so the
 * dashboard doesn't keep showing a stale "already sorted" state after the
 * wipe. A full clean slate: re-running "Assign random rankings" afterward
 * generates fresh rankings rather than reusing old ones. Mirrors the
 * blunt reset scripts/simulate-wave-cycle.ts does at the start of a run,
 * just exposed as a one-click control instead of a full script re-run.
 */
export async function resetAllSubmissionsAndAssignments(
  who: string,
): Promise<{ clearedAssignments: number; clearedSubmissions: number }> {
  return db.transaction(async (tx) => {
    const existingAssignments = await tx.select({ id: assignments.id }).from(assignments);
    const clearedAssignments = existingAssignments.length;
    if (clearedAssignments > 0) {
      await tx.delete(assignments);
    }

    const existingSubmissions = await tx.select({ id: submissions.id }).from(submissions);
    const clearedSubmissions = existingSubmissions.length;
    if (clearedSubmissions > 0) {
      await tx.delete(submissions);
    }

    await tx.update(waveSchedule).set({ sortedAt: null });
    await tx.insert(changeLog).values({
      who,
      action: "reset_submissions_and_assignments",
      toTrip: `cleared_${clearedAssignments}_assignments_${clearedSubmissions}_submissions`,
    });
    return { clearedAssignments, clearedSubmissions };
  });
}
