// Generates and submits a realistic ranked-choice distribution for every
// student currently on the roster — not a fresh set of fixtures like
// scripts/simulate.ts, but real submissions against whatever roster/trips
// already exist in whichever DB DATABASE_URL points at. Writes directly to
// the submissions table (bypassing the HTTP API/wave-gating entirely,
// since this is about feeding the LOTTERY algorithm a realistic
// distribution to sort, not testing concurrency or gating — that's what
// scripts/simulate.ts is for).
//
// Usage: npm run generate-rankings
//
// Edit TRIP_WEIGHTS below to control what share of students rank each trip
// highly — a trip's weight is its relative pull at every one of a
// student's 4 choice slots, so a heavily-weighted trip ends up both more
// likely to be ranked at all AND more likely to land as choice 1/2. Any
// trip not listed here falls back to DEFAULT_WEIGHT.

import "dotenv/config";
import { db } from "../src/db/client";
import { roster, trips } from "../src/db/schema";
import { upsertSubmission } from "../src/db/queries/submissions";

const TRIP_WEIGHTS: Record<string, number> = {
  "Aquarium Day Trip": 35,
  "Escape Room Challenge": 30,
  "Museum of Art": 15,
  "Rock Climbing": 12,
  "Beach Cleanup": 8,
};
const DEFAULT_WEIGHT = 5;

/** Opted-out share of students, for realism. Set to 0 to disable. */
const OPT_OUT_RATE = 0.03;

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

async function main() {
  const allTrips = await db.select().from(trips);
  if (allTrips.length < 4) {
    console.error(`Need at least 4 trips to rank; found ${allTrips.length}.`);
    process.exit(1);
  }

  const weightedTrips = allTrips.map((t) => {
    const weight = TRIP_WEIGHTS[t.name];
    if (weight === undefined) {
      console.warn(`No weight configured for "${t.name}" — using default (${DEFAULT_WEIGHT}).`);
    }
    return { item: t, weight: weight ?? DEFAULT_WEIGHT };
  });

  const allStudents = await db.select().from(roster);
  if (allStudents.length === 0) {
    console.error("No roster rows found — run seed:dev-data or import-roster first.");
    process.exit(1);
  }

  console.log(`Generating rankings for ${allStudents.length} students across ${allTrips.length} trips...`);

  const choice1Counts = new Map<string, number>();
  let optedOutCount = 0;

  for (const student of allStudents) {
    if (Math.random() < OPT_OUT_RATE) {
      await upsertSubmission(student.email, {
        optedOut: true,
        tripChoice1: null,
        tripChoice2: null,
        tripChoice3: null,
        tripChoice4: null,
      });
      optedOutCount++;
      continue;
    }

    const [c1, c2, c3, c4] = weightedSampleWithoutReplacement(weightedTrips, 4);
    await upsertSubmission(student.email, {
      optedOut: false,
      tripChoice1: c1.id,
      tripChoice2: c2.id,
      tripChoice3: c3.id,
      tripChoice4: c4.id,
    });
    choice1Counts.set(c1.name, (choice1Counts.get(c1.name) ?? 0) + 1);
  }

  console.log(`\nDone. ${allStudents.length - optedOutCount} submitted, ${optedOutCount} opted out.`);
  console.log("\n#1 choice distribution:");
  for (const t of allTrips) {
    const count = choice1Counts.get(t.name) ?? 0;
    console.log(`  ${t.name}: ${count}`);
  }
  console.log("\nNext: run `npm run cli -- run-sort <wave>` per wave to see how the lottery handles it.");
  process.exit(0);
}

main();
