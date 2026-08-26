// Full end-to-end wave-cycle simulation: compresses all 4 waves into real
// short windows (back to back), fires weighted-random submissions through
// the REAL HTTP endpoint (real wave-gating enforced, not faked) as each
// wave's window is actually open, confirms an out-of-wave grade is
// genuinely blocked at each step, runs the real lottery once each window
// closes, and finishes with a full per-student choice-rank report. A
// configurable number of students (NON_RESPONDER_COUNT) submit nothing at
// all, so the admin dashboard's non-responder flagging gets exercised too.
// Resets all existing submissions/assignments for the current roster
// first, so this is a clean run. Trip capacity is NOT touched by this
// script — set it separately (CLI `set-capacity`) if you want a specific
// demand-vs-supply scenario.
//
// Usage: npm run simulate:wave-cycle -- http://localhost:3000
// Requires SIMULATION_SECRET in .env matching the target deployment.
//
// WAVE_MINUTES must stay comfortably larger than the app's current
// GRACE_PERIOD_MS (src/db/queries/waves.ts) — otherwise the next wave's
// pre-open grace window reaches backward into the current wave, and the
// "next grade is still blocked" check below will (correctly!) fail, same
// as the app would do for real at that spacing.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { roster, trips, submissions, assignments, waveSchedule } from "../src/db/schema";
import { runLotteryForWave } from "../src/lib/lottery";
import { GRACE_PERIOD_MS } from "../src/db/queries/waves";
import type { Grade } from "../src/lib/grade";

const BASE_URL = process.argv[2] ?? process.env.SIMULATE_BASE_URL;
const SIMULATION_SECRET = process.env.SIMULATION_SECRET;
const WAVE_MINUTES = 5;
const WAVE_MS = WAVE_MINUTES * 60 * 1000;
// Wait out the app's actual current grace period (whatever it's configured
// to right now) plus a small safety margin, before triggering the sort.
const GRACE_MS = GRACE_PERIOD_MS + 5000;

/**
 * Percent weights applied to trips in alphabetical-by-name order, for a
 * deliberately skewed demand test (must have one entry per trip, summing
 * to ~100). Set to null for uniform-random choices instead.
 */
const TRIP_WEIGHT_PERCENTAGES: number[] | null = [50, 20, 10, 10, 10];

/**
 * How many students, picked at random across the whole roster, should
 * submit nothing at all this run — real non-responders, left for manual
 * placement rather than folded into the lottery (§3).
 */
const NON_RESPONDER_COUNT = 7;

function weightedSampleWithoutReplacement<T>(
  items: { item: T; weight: number }[],
  count: number,
): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    result.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return result;
}

const WAVES: { wave: number; grade: Grade }[] = [
  { wave: 1, grade: "senior" },
  { wave: 2, grade: "junior" },
  { wave: 3, grade: "sophomore" },
  { wave: 4, grade: "freshman" },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function submitFor(email: string, tripIds: string[]) {
  const res = await fetch(`${BASE_URL}/api/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-simulation-secret": SIMULATION_SECRET!,
      "x-simulation-email": email,
    },
    body: JSON.stringify({ optedOut: false, choices: tripIds }),
  });
  return res.status;
}

async function main() {
  if (!BASE_URL) {
    console.error("Usage: npm run simulate:wave-cycle -- <base-url>");
    process.exit(1);
  }
  if (!SIMULATION_SECRET) {
    console.error("Set SIMULATION_SECRET in .env, matching the target deployment.");
    process.exit(1);
  }

  const allTrips = await db.select().from(trips);
  if (allTrips.length < 4) {
    console.error(`Need at least 4 trips; found ${allTrips.length}.`);
    process.exit(1);
  }
  const tripIdsAll = allTrips.map((t) => t.id);

  const sortedTrips = [...allTrips].sort((a, b) => a.name.localeCompare(b.name));
  if (TRIP_WEIGHT_PERCENTAGES && TRIP_WEIGHT_PERCENTAGES.length !== sortedTrips.length) {
    console.error(
      `TRIP_WEIGHT_PERCENTAGES has ${TRIP_WEIGHT_PERCENTAGES.length} entries but there are ${sortedTrips.length} trips.`,
    );
    process.exit(1);
  }
  const weightedTrips = sortedTrips.map((t, i) => ({
    item: t,
    weight: TRIP_WEIGHT_PERCENTAGES ? TRIP_WEIGHT_PERCENTAGES[i] : 1,
  }));
  if (TRIP_WEIGHT_PERCENTAGES) {
    log("Demand weights for this run:");
    for (const wt of weightedTrips) log(`  ${wt.item.name}: ${wt.weight}%`);
  }

  log(`Simulating against ${BASE_URL}. Wave duration: ${WAVE_MINUTES} minutes each, ${WAVES.length} waves (~${(WAVES.length * WAVE_MINUTES)} min total).`);

  log("Resetting submissions/assignments for the current roster (clean run)...");
  const allStudents = await db.select().from(roster);
  await db.delete(assignments);
  await db.delete(submissions);

  const nonResponders = new Set(shuffle(allStudents).slice(0, NON_RESPONDER_COUNT).map((s) => s.email));
  log(`Selected ${nonResponders.size} students as non-responders (will submit nothing): ${[...nonResponders].join(", ")}`);

  log(`Scheduling ${WAVES.length} back-to-back ${WAVE_MINUTES}-minute waves starting now...`);
  const scheduleStart = new Date(Date.now() + 5000); // small buffer so wave 1's "opensAt" isn't already in the past by the time we insert it
  const schedule = WAVES.map((w, i) => ({
    wave: w.wave,
    grade: w.grade,
    opensAt: new Date(scheduleStart.getTime() + i * WAVE_MS),
    closesAt: new Date(scheduleStart.getTime() + (i + 1) * WAVE_MS),
  }));
  for (const w of schedule) {
    await db
      .insert(waveSchedule)
      .values(w)
      .onConflictDoUpdate({
        target: waveSchedule.wave,
        set: { opensAt: w.opensAt, closesAt: w.closesAt, sortedAt: null },
      });
    log(`  Wave ${w.wave} (${w.grade}): opens ${w.opensAt.toLocaleTimeString()}, closes ${w.closesAt.toLocaleTimeString()}`);
  }

  const allChecks: { name: string; pass: boolean; detail: string }[] = [];

  for (let i = 0; i < schedule.length; i++) {
    const w = schedule[i];
    const waitMs = w.opensAt.getTime() - Date.now();
    if (waitMs > 0) {
      log(`Waiting ${Math.round(waitMs / 1000)}s for wave ${w.wave} (${w.grade}) to open...`);
      await sleep(waitMs);
    }
    log(`Wave ${w.wave} (${w.grade}) is now open.`);

    // Confirm a not-yet-open grade is genuinely blocked, whenever one exists.
    const notYetOpen = WAVES.slice(i + 1);
    if (notYetOpen.length > 0) {
      const blockedGrade = notYetOpen[0].grade;
      const blockedStudent = allStudents.find((s) => s.grade === blockedGrade);
      if (blockedStudent) {
        const status = await submitFor(blockedStudent.email, tripIdsAll.slice(0, 4));
        const pass = status === 403;
        allChecks.push({
          name: `Wave ${w.wave}: ${blockedGrade} correctly blocked`,
          pass,
          detail: `HTTP ${status}`,
        });
        log(`  Out-of-wave check (${blockedGrade}): ${pass ? "PASS" : "FAIL"} (HTTP ${status})`);
      }
    }

    const allGradeStudents = allStudents.filter((s) => s.grade === w.grade);
    const gradeStudents = allGradeStudents.filter((s) => !nonResponders.has(s.email));
    const skipped = allGradeStudents.length - gradeStudents.length;
    log(`  Submitting weighted rankings for ${gradeStudents.length} ${w.grade} students (${skipped} left as non-responders)...`);
    const results = await Promise.all(
      gradeStudents.map(async (s) => {
        const choices = weightedSampleWithoutReplacement(weightedTrips, 4).map((t) => t.id);
        const status = await submitFor(s.email, choices);
        return status;
      }),
    );
    const failures = results.filter((s) => s !== 200);
    allChecks.push({
      name: `Wave ${w.wave}: all ${w.grade} submissions accepted`,
      pass: failures.length === 0,
      detail: `${results.length - failures.length}/${results.length} succeeded`,
    });
    log(`  ${results.length - failures.length}/${results.length} submissions accepted.`);

    const remainingMs = w.closesAt.getTime() - Date.now() + GRACE_MS;
    if (remainingMs > 0) {
      log(`  Waiting ${Math.round(remainingMs / 1000)}s for wave ${w.wave} to close...`);
      await sleep(remainingMs);
    }

    log(`  Running the lottery for wave ${w.wave} (${w.grade})...`);
    const result = await runLotteryForWave(w.wave, "simulate-wave-cycle");
    log(`  Wave ${w.wave} result: ${result.assignedCount} assigned, ${result.unplacedCount} unplaced of ${result.eligibleCount} eligible.`);

    const tripFillAfter = await db
      .select({ tripId: assignments.tripId })
      .from(assignments);
    const fillCount = new Map<string, number>();
    for (const a of tripFillAfter) fillCount.set(a.tripId, (fillCount.get(a.tripId) ?? 0) + 1);
    const overbooked = allTrips.filter((t) => (fillCount.get(t.id) ?? 0) > t.capacity);
    allChecks.push({
      name: `Wave ${w.wave}: no trip over capacity`,
      pass: overbooked.length === 0,
      detail: overbooked.map((t) => `${t.name}: ${fillCount.get(t.id)}/${t.capacity}`).join(", ") || "ok",
    });
  }

  log("\nAll waves complete. Building the final roster report...\n");

  const finalRows = await db
    .select({
      email: roster.email,
      name: roster.name,
      grade: roster.grade,
      optedOut: submissions.optedOut,
      tripChoice1: submissions.tripChoice1,
      tripChoice2: submissions.tripChoice2,
      tripChoice3: submissions.tripChoice3,
      tripChoice4: submissions.tripChoice4,
      assignedTripId: assignments.tripId,
    })
    .from(roster)
    .leftJoin(submissions, eq(submissions.studentEmail, roster.email))
    .leftJoin(assignments, eq(assignments.studentEmail, roster.email))
    .orderBy(roster.grade, roster.email);

  const tripName = new Map(allTrips.map((t) => [t.id, t.name]));

  console.log("Grade      Email                                  Assigned trip          Choice");
  console.log("-".repeat(100));
  const rankCounts = [0, 0, 0, 0];
  let noneOf4 = 0;
  let optedOutCount = 0;
  let noSubmissionCount = 0;

  for (const row of finalRows) {
    let outcome: string;
    if (row.optedOut) {
      outcome = "opted out";
      optedOutCount++;
    } else if (!row.assignedTripId) {
      if (row.tripChoice1 === null && !row.optedOut) {
        outcome = "no submission";
        noSubmissionCount++;
      } else {
        outcome = "none of their 4 choices";
        noneOf4++;
      }
    } else {
      const choiceList = [row.tripChoice1, row.tripChoice2, row.tripChoice3, row.tripChoice4];
      const rank = choiceList.indexOf(row.assignedTripId);
      if (rank >= 0) {
        outcome = `#${rank + 1} choice`;
        rankCounts[rank]++;
      } else {
        outcome = "manual override (not from their ranking)";
      }
    }
    const assignedName = row.assignedTripId ? tripName.get(row.assignedTripId) ?? "?" : "—";
    console.log(
      `${row.grade.padEnd(10)} ${row.email.padEnd(38)} ${assignedName.padEnd(22)} ${outcome}`,
    );
  }

  console.log("\n--- Summary ---");
  console.log(`Got #1 choice: ${rankCounts[0]}`);
  console.log(`Got #2 choice: ${rankCounts[1]}`);
  console.log(`Got #3 choice: ${rankCounts[2]}`);
  console.log(`Got #4 choice: ${rankCounts[3]}`);
  console.log(`Got none of their 4 choices: ${noneOf4}`);
  console.log(`Opted out: ${optedOutCount}`);
  console.log(`Non-responders (no submission at all): ${noSubmissionCount}`);

  console.log("\n--- Checks ---");
  for (const c of allChecks) {
    console.log(`${c.pass ? "PASS" : "FAIL"} — ${c.name} (${c.detail})`);
  }
  const allPassed = allChecks.every((c) => c.pass);
  console.log(allPassed ? "\nAll checks passed." : "\nSome checks failed — see above.");
  process.exit(allPassed ? 0 : 1);
}

main();
