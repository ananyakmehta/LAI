import { eq, inArray } from "drizzle-orm";
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
 * Bulk version of the CLI's `assign-non-responder` for the per-trip roster
 * page's "Non-responders" checklist — same manual_non_responder_placement /
 * assign_non_responder path, just for many students against one trip in a
 * single transaction. The page only offers non-responders who ALSO don't
 * have an assignment yet (getUnassignedNonResponders), so under normal use
 * there's no existing row to worry about — the check below is a backstop
 * against a stale page (another tab/admin placed one of these students in
 * the meantime), giving a clear error instead of a raw constraint failure.
 *
 * Hard-blocks over capacity rather than offering a force override — the
 * page's own UI already disables its "Move here" button once the
 * selection would exceed remaining seats, so this check is a server-side
 * backstop, not a second confirmation step like the general Move tool's.
 */
export async function assignNonRespondersToTrip(
  emails: string[],
  tripId: string,
  who: string,
): Promise<{ assigned: number }> {
  return db.transaction(async (tx) => {
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw new Error("Trip not found.");

    const alreadyAssigned = await tx
      .select({ studentEmail: assignments.studentEmail })
      .from(assignments)
      .where(inArray(assignments.studentEmail, emails));
    if (alreadyAssigned.length > 0) {
      throw new Error(
        `${alreadyAssigned.map((a) => a.studentEmail).join(", ")} already has an assignment — refresh the page and try again.`,
      );
    }

    const currentAssignments = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.tripId, tripId));
    if (currentAssignments.length + emails.length > trip.capacity) {
      throw new Error(
        `Not enough seats: ${trip.name} has ${trip.capacity - currentAssignments.length} left, tried to place ${emails.length}.`,
      );
    }

    for (const email of emails) {
      await tx.insert(assignments).values({
        studentEmail: email,
        tripId,
        assignmentMethod: "manual_non_responder_placement",
      });
      await tx.insert(changeLog).values({
        who,
        action: "assign_non_responder",
        studentEmail: email,
        toTrip: tripId,
      });
    }

    return { assigned: emails.length };
  });
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
// How far out "Reset" pushes every wave's open/close window — long enough
// that no student reads a wave as open (or as closed-and-sorted) until the
// owner deliberately (re)configures real dates via set-event-dates/
// set-wave. Clearing sortedAt alone isn't enough: a prior startWaveNow/
// endWaveNow test run leaves opensAt/closesAt in the past, which once
// reset also nulls sortedAt, still reads as "wave hasn't opened, but
// opensAt is also in the past" — actually worse, it falls through to
// State C ("results posting soon") for a wave nobody ever really ran.
const RESET_WAVE_OFFSET_MS = 365 * 24 * 60 * 60 * 1000;

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

    const opensAt = new Date(Date.now() + RESET_WAVE_OFFSET_MS);
    const closesAt = new Date(opensAt.getTime() + 60 * 60 * 1000);
    await tx.update(waveSchedule).set({ opensAt, closesAt, sortedAt: null });

    await tx.insert(changeLog).values({
      who,
      action: "reset_submissions_and_assignments",
      toTrip: `cleared_${clearedAssignments}_assignments_${clearedSubmissions}_submissions`,
    });
    return { clearedAssignments, clearedSubmissions };
  });
}
