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
      submissionStatus: sql<"none" | "opted_out" | "submitted" | "MANUAL">`
        case
          when ${submissions.studentEmail} is not null and ${submissions.optedOut} then 'opted_out'
          when ${submissions.studentEmail} is not null then 'submitted'
          when ${assignments.studentEmail} is not null then 'MANUAL'
          else 'none'
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

/**
 * Non-responders (roster MINUS submissions, §3) who ALSO don't have an
 * assignment yet. A student can be manually placed without ever
 * submitting (the trip page's "Move here" checklist, or the CLI's
 * assign-non-responder), and once that happens they no longer need
 * manual placement — showing them here anyway would offer a student the
 * "Move here" checklist can't actually place (unique constraint on
 * assignments.studentEmail) and would leave them stuck in the roster
 * overview's "Non-responders" list after being handled. Used by both.
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
 * Explicitly opted out (submitted with optedOut: true) — distinct from a
 * non-responder, who never submitted anything at all. Surfaced as its own
 * flagged list on the roster overview rather than folded into
 * non-responders: a lot of students who say they aren't going change
 * their mind later, so the owner needs to see this group separately to
 * know they already made an active choice, not just silence.
 */
export async function getOptedOut(grade: Grade) {
  return db
    .select({
      name: roster.name,
      email: roster.email,
      notes: roster.notes,
    })
    .from(roster)
    .innerJoin(submissions, eq(submissions.studentEmail, roster.email))
    .where(and(eq(roster.grade, grade), eq(submissions.optedOut, true)));
}

/**
 * Roster MINUS waivers, restricted to one grade — waiver upload is
 * tracked independently of ranking submission (§3), so this can include
 * students who already submitted or were manually placed. Rendered as its
 * own scrollable block on the roster overview rather than an unbounded
 * list, since early in the process this can be most of the roster.
 */
export async function getMissingWaivers(grade: Grade) {
  return db
    .select({
      name: roster.name,
      email: roster.email,
      notes: roster.notes,
    })
    .from(roster)
    .leftJoin(waivers, eq(waivers.studentEmail, roster.email))
    .where(and(eq(roster.grade, grade), isNull(waivers.studentEmail)));
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
