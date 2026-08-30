import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, roster, submissions, trips, waivers } from "@/db/schema";
import type { Grade } from "@/lib/grade";

/**
 * The Surface 1 master overview (§9): every roster student, their grade,
 * submission status, waiver status, and current trip assignment. Optionally
 * scoped to one trip (used for the per-trip roster view and the
 * teacher-tier export, which is restricted to their own trip).
 */
export async function getMasterOverview(tripId?: string) {
  const rows = await db
    .select({
      name: roster.name,
      email: roster.email,
      grade: roster.grade,
      notes: roster.notes,
      submissionStatus: sql<"none" | "opted_out" | "submitted">`
        case
          when ${submissions.studentEmail} is null then 'none'
          when ${submissions.optedOut} then 'opted_out'
          else 'submitted'
        end
      `,
      waiverUploadedAt: waivers.uploadedAt,
      assignedTripId: assignments.tripId,
      assignedTripName: trips.name,
      assignmentMethod: assignments.assignmentMethod,
    })
    .from(roster)
    .leftJoin(submissions, eq(submissions.studentEmail, roster.email))
    .leftJoin(waivers, eq(waivers.studentEmail, roster.email))
    .leftJoin(assignments, eq(assignments.studentEmail, roster.email))
    .leftJoin(trips, eq(trips.id, assignments.tripId));

  return tripId ? rows.filter((r) => r.assignedTripId === tripId) : rows;
}

/** roster MINUS submissions, restricted to one grade — §3's non-responders. */
export async function getNonResponders(grade: Grade) {
  return db
    .select({
      name: roster.name,
      email: roster.email,
      notes: roster.notes,
    })
    .from(roster)
    .leftJoin(submissions, eq(submissions.studentEmail, roster.email))
    .where(and(eq(roster.grade, grade), isNull(submissions.studentEmail)));
}

/**
 * Non-responders (roster MINUS submissions, per §3's definition — same as
 * getNonResponders) who ALSO don't have an assignment yet. Used by the
 * per-trip roster page's "Move here" checklist: offering an already-placed
 * non-responder there would try to insert a second assignments row for
 * them and hit the unique constraint. getNonResponders itself keeps the
 * broader, doc-defined meaning (no submission, regardless of assignment
 * status) for the main dashboard's list — this is a narrower filter for
 * this one specific action, not a redefinition of "non-responder."
 */
export async function getUnassignedNonResponders(grade: Grade) {
  return db
    .select({
      name: roster.name,
      email: roster.email,
      notes: roster.notes,
    })
    .from(roster)
    .leftJoin(submissions, eq(submissions.studentEmail, roster.email))
    .leftJoin(assignments, eq(assignments.studentEmail, roster.email))
    .where(
      and(
        eq(roster.grade, grade),
        isNull(submissions.studentEmail),
        isNull(assignments.studentEmail),
      ),
    );
}

/**
 * Submitted but not assigned after their wave's lottery ran — distinct from
 * non-responders (§3): these students DID participate, but all 4 choices
 * were full by their turn. Surfaced separately for the owner's attention.
 */
export async function getUnplacedSubmitters(grade: Grade) {
  return db
    .select({
      name: roster.name,
      email: roster.email,
      notes: roster.notes,
    })
    .from(roster)
    .innerJoin(submissions, eq(submissions.studentEmail, roster.email))
    .leftJoin(assignments, eq(assignments.studentEmail, roster.email))
    .where(
      and(
        eq(roster.grade, grade),
        eq(submissions.optedOut, false),
        isNull(assignments.studentEmail),
      ),
    );
}
