import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
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
import type { Grade } from "@/lib/grade";

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

// ---------------------------------------------------------------------------
// Real-event two-pass lottery (2026 Learning in Action Day brief) — strict
// class-level priority, not the single-grade-per-wave model above.
//
// Pass 1 (5 min after the senior/junior priority deadline): seniors who
// submitted on time, placed first with full capacity; then juniors who
// submitted on time, placed into whatever's left. Each grade is its own
// sequential group — juniors never compete with seniors for a seat.
//
// Pass 2 (5 min after the shared final deadline): sophomores and any
// senior/junior who submitted AFTER their own priority deadline (but
// before the final one) are merged into ONE shuffled pool — missing your
// priority window drops you to this tier, same as a sophomore. Freshmen
// are placed after that pool is exhausted, never merged with it.
// ---------------------------------------------------------------------------

interface EligibleStudent {
  studentEmail: string;
  choice1: string | null;
  choice2: string | null;
  choice3: string | null;
  choice4: string | null;
}

export interface PassGroupResult {
  label: string;
  eligibleCount: number;
  assignedCount: number;
  unplacedCount: number;
}

export interface PassResult {
  pass: 1 | 2 | 3;
  groups: PassGroupResult[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadCapacityState(tx: Tx) {
  const allTrips = await tx.select().from(trips);
  const currentAssignments = await tx.select({ tripId: assignments.tripId }).from(assignments);
  const filledCount = new Map<string, number>();
  for (const trip of allTrips) filledCount.set(trip.id, 0);
  for (const a of currentAssignments) {
    filledCount.set(a.tripId, (filledCount.get(a.tripId) ?? 0) + 1);
  }
  const capacityById = new Map(allTrips.map((t) => [t.id, t.capacity]));
  return { filledCount, capacityById };
}

function placeIntoTrips(
  students: EligibleStudent[],
  filledCount: Map<string, number>,
  capacityById: Map<string, number>,
): { assigned: { studentEmail: string; tripId: string }[]; unplaced: string[] } {
  const shuffled = shuffle(students);
  const assigned: { studentEmail: string; tripId: string }[] = [];
  const unplaced: string[] = [];

  for (const student of shuffled) {
    const choices = [student.choice1, student.choice2, student.choice3, student.choice4].filter(
      (c): c is string => c !== null,
    );
    let placed = false;
    for (const tripId of choices) {
      const filled = filledCount.get(tripId) ?? 0;
      const capacity = capacityById.get(tripId) ?? 0;
      if (filled < capacity) {
        filledCount.set(tripId, filled + 1);
        assigned.push({ studentEmail: student.studentEmail, tripId });
        placed = true;
        break;
      }
    }
    if (!placed) unplaced.push(student.studentEmail);
  }

  return { assigned, unplaced };
}

async function getEligibleSubmitters(
  tx: Tx,
  grade: Grade,
  opts?: { submittedAtOrBefore?: Date; submittedAfter?: Date },
): Promise<EligibleStudent[]> {
  const conditions = [eq(roster.grade, grade), eq(submissions.optedOut, false)];
  if (opts?.submittedAtOrBefore) conditions.push(lte(submissions.submittedAt, opts.submittedAtOrBefore));
  if (opts?.submittedAfter) conditions.push(gt(submissions.submittedAt, opts.submittedAfter));

  return tx
    .select({
      studentEmail: submissions.studentEmail,
      choice1: submissions.tripChoice1,
      choice2: submissions.tripChoice2,
      choice3: submissions.tripChoice3,
      choice4: submissions.tripChoice4,
    })
    .from(submissions)
    .innerJoin(roster, eq(submissions.studentEmail, roster.email))
    .where(and(...conditions));
}

/** Clears any existing assignment for the given emails, snapshotting first — re-run safety, same spirit as runLotteryForWave. */
async function clearPriorAssignments(tx: Tx, pass: 1 | 2, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const prior = await tx
    .select({
      studentEmail: assignments.studentEmail,
      tripId: assignments.tripId,
      assignedAt: assignments.assignedAt,
      assignmentMethod: assignments.assignmentMethod,
    })
    .from(assignments)
    .where(inArray(assignments.studentEmail, emails));
  if (prior.length === 0) return;
  await tx.insert(assignmentSnapshots).values({ wave: pass, data: prior });
  await tx.delete(assignments).where(
    inArray(assignments.studentEmail, prior.map((a) => a.studentEmail)),
  );
}

async function writeGroupResults(
  tx: Tx,
  triggeredBy: string,
  label: string,
  eligible: EligibleStudent[],
  assigned: { studentEmail: string; tripId: string }[],
  unplaced: string[],
): Promise<PassGroupResult> {
  for (const email of unplaced) {
    await tx.insert(changeLog).values({
      who: triggeredBy,
      action: "lottery_no_choice_available",
      studentEmail: email,
    });
  }
  return {
    label,
    eligibleCount: eligible.length,
    assignedCount: assigned.length,
    unplacedCount: unplaced.length,
  };
}

/**
 * Sorts seniors (on-time), then juniors (on-time), sequentially — each
 * fully processed before the next starts. Owner-triggered manually (or by
 * cron, best-effort — see api/cron/sort's own caveat about Hobby-plan
 * daily granularity not actually hitting the "5 minutes after" brief).
 */
export async function runLotteryPass1(triggeredBy: string): Promise<PassResult> {
  return db.transaction(async (tx) => {
    const waves = await tx.select().from(waveSchedule);
    const seniorWave = waves.find((w) => w.grade === "senior");
    const juniorWave = waves.find((w) => w.grade === "junior");
    if (!seniorWave || !juniorWave) {
      throw new Error("Senior/junior wave schedule isn't configured yet.");
    }

    const seniors = await getEligibleSubmitters(tx, "senior", {
      submittedAtOrBefore: seniorWave.closesAt,
    });
    const juniors = await getEligibleSubmitters(tx, "junior", {
      submittedAtOrBefore: juniorWave.closesAt,
    });

    await clearPriorAssignments(tx, 1, [
      ...seniors.map((s) => s.studentEmail),
      ...juniors.map((s) => s.studentEmail),
    ]);

    const { filledCount, capacityById } = await loadCapacityState(tx);
    const groups: PassGroupResult[] = [];
    const allAssigned: { studentEmail: string; tripId: string }[] = [];

    const seniorResult = placeIntoTrips(seniors, filledCount, capacityById);
    allAssigned.push(...seniorResult.assigned);
    groups.push(await writeGroupResults(tx, triggeredBy, "senior", seniors, seniorResult.assigned, seniorResult.unplaced));

    const juniorResult = placeIntoTrips(juniors, filledCount, capacityById);
    allAssigned.push(...juniorResult.assigned);
    groups.push(await writeGroupResults(tx, triggeredBy, "junior", juniors, juniorResult.assigned, juniorResult.unplaced));

    if (allAssigned.length > 0) {
      await tx.insert(assignments).values(
        allAssigned.map((a) => ({ ...a, assignmentMethod: "lottery" as const })),
      );
    }

    await tx
      .update(waveSchedule)
      .set({ sortedAt: new Date() })
      .where(inArray(waveSchedule.grade, ["senior", "junior"]));

    await tx.insert(changeLog).values({
      who: triggeredBy,
      action: "run_sort_pass_1",
      toTrip: `senior:${seniors.length}_junior:${juniors.length}`,
    });

    return { pass: 1, groups };
  });
}

/**
 * Sorts sophomores merged with any senior/junior who submitted after their
 * own priority deadline, as one shuffled pool — then freshmen, separately,
 * after. See this file's top-of-section comment for why they're merged.
 */
export async function runLotteryPass2(triggeredBy: string): Promise<PassResult> {
  return db.transaction(async (tx) => {
    const waves = await tx.select().from(waveSchedule);
    const seniorWave = waves.find((w) => w.grade === "senior");
    const juniorWave = waves.find((w) => w.grade === "junior");
    const sophomoreWave = waves.find((w) => w.grade === "sophomore");
    const freshmanWave = waves.find((w) => w.grade === "freshman");
    if (!seniorWave || !juniorWave || !sophomoreWave || !freshmanWave) {
      throw new Error("Wave schedule isn't fully configured yet.");
    }

    const sophomores = await getEligibleSubmitters(tx, "sophomore");
    const lateSeniors = await getEligibleSubmitters(tx, "senior", {
      submittedAfter: seniorWave.closesAt,
    });
    const lateJuniors = await getEligibleSubmitters(tx, "junior", {
      submittedAfter: juniorWave.closesAt,
    });
    const freshmen = await getEligibleSubmitters(tx, "freshman");

    const mergedPool = [...sophomores, ...lateSeniors, ...lateJuniors];

    await clearPriorAssignments(tx, 2, [
      ...mergedPool.map((s) => s.studentEmail),
      ...freshmen.map((s) => s.studentEmail),
    ]);

    const { filledCount, capacityById } = await loadCapacityState(tx);
    const groups: PassGroupResult[] = [];
    const allAssigned: { studentEmail: string; tripId: string }[] = [];

    const poolResult = placeIntoTrips(mergedPool, filledCount, capacityById);
    allAssigned.push(...poolResult.assigned);
    groups.push(
      await writeGroupResults(
        tx,
        triggeredBy,
        "sophomore + late senior/junior",
        mergedPool,
        poolResult.assigned,
        poolResult.unplaced,
      ),
    );

    const freshmanResult = placeIntoTrips(freshmen, filledCount, capacityById);
    allAssigned.push(...freshmanResult.assigned);
    groups.push(
      await writeGroupResults(tx, triggeredBy, "freshman", freshmen, freshmanResult.assigned, freshmanResult.unplaced),
    );

    if (allAssigned.length > 0) {
      await tx.insert(assignments).values(
        allAssigned.map((a) => ({ ...a, assignmentMethod: "lottery" as const })),
      );
    }

    await tx
      .update(waveSchedule)
      .set({ sortedAt: new Date() })
      .where(inArray(waveSchedule.grade, ["sophomore", "freshman"]));

    await tx.insert(changeLog).values({
      who: triggeredBy,
      action: "run_sort_pass_2",
      toTrip: `pool:${mergedPool.length}_freshman:${freshmen.length}`,
    });

    return { pass: 2, groups };
  });
}

/**
 * Eligibility for the final straggler pass: any grade, opted in, and —
 * unlike Pass 1/2's deadline-based grouping — simply no assignments row
 * yet. That covers both genuine latecomers (submitted after Pass 1/2 ran)
 * and anyone re-submitted after this grade's pass already placed them
 * doesn't re-enter this pool, since they already have an assignment.
 */
async function getUnassignedSubmitters(tx: Tx): Promise<EligibleStudent[]> {
  return tx
    .select({
      studentEmail: submissions.studentEmail,
      choice1: submissions.tripChoice1,
      choice2: submissions.tripChoice2,
      choice3: submissions.tripChoice3,
      choice4: submissions.tripChoice4,
    })
    .from(submissions)
    .innerJoin(roster, eq(submissions.studentEmail, roster.email))
    .leftJoin(assignments, eq(submissions.studentEmail, assignments.studentEmail))
    .where(and(eq(submissions.optedOut, false), isNull(assignments.studentEmail)));
}

/**
 * Final catch-all pass for stragglers (2026 brief: the extended window
 * past both regular passes). Everyone across every grade who has a
 * ranking in but no trip yet — genuine latecomers plus anyone still
 * unplaced from Pass 1/2's capacity crunch — goes into ONE shuffled pool,
 * deliberately lowest priority against whatever capacity is left, with no
 * grade-based tiering. Re-running it later only processes whoever is
 * still unassigned at that point, since eligibility is "no assignment
 * row" rather than a snapshot/clear like Pass 1/2 — nothing to undo for a
 * student this pass hasn't touched yet.
 */
export async function runFinalSort(triggeredBy: string): Promise<PassResult> {
  return db.transaction(async (tx) => {
    const stragglers = await getUnassignedSubmitters(tx);
    const { filledCount, capacityById } = await loadCapacityState(tx);
    const result = placeIntoTrips(stragglers, filledCount, capacityById);

    if (result.assigned.length > 0) {
      await tx.insert(assignments).values(
        result.assigned.map((a) => ({ ...a, assignmentMethod: "lottery" as const })),
      );
    }

    const group = await writeGroupResults(
      tx,
      triggeredBy,
      "stragglers (all grades)",
      stragglers,
      result.assigned,
      result.unplaced,
    );

    await tx.insert(changeLog).values({
      who: triggeredBy,
      action: "run_sort_final",
      toTrip: `stragglers:${stragglers.length}`,
    });

    return { pass: 3, groups: [group] };
  });
}
