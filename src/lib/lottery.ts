import { randomInt } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assignments,
  assignmentSnapshots,
  changeLog,
  roster,
  submissions,
  trips,
  waveSchedule,
} from "@/db/schema";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface LotteryResult {
  wave: number;
  eligibleCount: number;
  assignedCount: number;
  unplacedCount: number;
}

/**
 * The assignment algorithm (§10), run once per wave: shuffle every student
 * in that grade who submitted (and didn't opt out), then walk the shuffled
 * order giving each student their highest-ranked choice that still has an
 * open seat. Runs in a single transaction so there's never a half-assigned
 * state visible to anyone (§10 step 5).
 *
 * A student whose all 4 choices are full by their turn is deliberately left
 * unassigned rather than placed arbitrarily — that absence (submitted, no
 * assignments row) is itself the flag the admin dashboard surfaces, and is
 * also written to change_log for the audit trail. Same for non-responders:
 * they never enter this function at all (no submissions row => not in the
 * eligible set), so `roster MINUS submissions` on the dashboard is what
 * surfaces them for manual placement (§3) — no separate flag column needed
 * for either case.
 *
 * Before writing new assignments, any existing assignments for this grade's
 * students are snapshotted to assignment_snapshots and cleared, so a
 * `run-sort` re-run is recoverable in spirit (§10's closing paragraph) even
 * though it isn't one-click undo.
 */
export async function runLotteryForWave(
  wave: number,
  triggeredBy: string,
): Promise<LotteryResult> {
  return db.transaction(async (tx) => {
    const [waveRow] = await tx
      .select()
      .from(waveSchedule)
      .where(eq(waveSchedule.wave, wave))
      .limit(1);

    if (!waveRow) {
      throw new Error(`No wave_schedule row for wave ${wave}`);
    }

    const priorAssignments = await tx
      .select({
        studentEmail: assignments.studentEmail,
        tripId: assignments.tripId,
        assignedAt: assignments.assignedAt,
        assignmentMethod: assignments.assignmentMethod,
      })
      .from(assignments)
      .innerJoin(roster, eq(assignments.studentEmail, roster.email))
      .where(eq(roster.grade, waveRow.grade));

    if (priorAssignments.length > 0) {
      await tx.insert(assignmentSnapshots).values({
        wave,
        data: priorAssignments,
      });
      await tx.delete(assignments).where(
        inArray(
          assignments.studentEmail,
          priorAssignments.map((a) => a.studentEmail),
        ),
      );
    }

    const eligible = await tx
      .select({
        studentEmail: submissions.studentEmail,
        choice1: submissions.tripChoice1,
        choice2: submissions.tripChoice2,
        choice3: submissions.tripChoice3,
        choice4: submissions.tripChoice4,
      })
      .from(submissions)
      .innerJoin(roster, eq(submissions.studentEmail, roster.email))
      .where(
        and(eq(roster.grade, waveRow.grade), eq(submissions.optedOut, false)),
      );

    const shuffled = shuffle(eligible);

    const allTrips = await tx.select().from(trips);
    const currentAssignments = await tx
      .select({ tripId: assignments.tripId })
      .from(assignments);

    const filledCount = new Map<string, number>();
    for (const trip of allTrips) filledCount.set(trip.id, 0);
    for (const a of currentAssignments) {
      filledCount.set(a.tripId, (filledCount.get(a.tripId) ?? 0) + 1);
    }
    const capacityById = new Map(allTrips.map((t) => [t.id, t.capacity]));

    const newAssignments: { studentEmail: string; tripId: string }[] = [];

    for (const student of shuffled) {
      const choices = [
        student.choice1,
        student.choice2,
        student.choice3,
        student.choice4,
      ].filter((c): c is string => c !== null);

      let placed = false;
      for (const tripId of choices) {
        const filled = filledCount.get(tripId) ?? 0;
        const capacity = capacityById.get(tripId) ?? 0;
        if (filled < capacity) {
          filledCount.set(tripId, filled + 1);
          newAssignments.push({ studentEmail: student.studentEmail, tripId });
          placed = true;
          break;
        }
      }

      if (!placed) {
        await tx.insert(changeLog).values({
          who: triggeredBy,
          action: "lottery_no_choice_available",
          studentEmail: student.studentEmail,
        });
      }
    }

    if (newAssignments.length > 0) {
      await tx.insert(assignments).values(
        newAssignments.map((a) => ({
          ...a,
          assignmentMethod: "lottery" as const,
        })),
      );
    }

    await tx
      .update(waveSchedule)
      .set({ sortedAt: new Date() })
      .where(eq(waveSchedule.wave, wave));

    await tx.insert(changeLog).values({
      who: triggeredBy,
      action: "run_sort",
      toTrip: `wave_${wave}`,
    });

    return {
      wave,
      eligibleCount: shuffled.length,
      assignedCount: newAssignments.length,
      unplacedCount: shuffled.length - newAssignments.length,
    };
  });
}
