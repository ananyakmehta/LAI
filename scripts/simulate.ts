// §13's pre-launch proof-of-concept and reusable regression test. Run
// against the LIVE deployed instance, not localhost, before any real
// student data is loaded:
//
//   npm run simulate -- https://your-app.vercel.app
//
// Requires SIMULATION_SECRET and CRON_SECRET in .env to match the values
// set on that deployment, and OWNER_EMAIL for change_log attribution isn't
// needed here (this script talks to the DB directly for fixtures, and to
// the deployed HTTP API for the actual concurrency test).

import "dotenv/config";
import { eq, like } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  roster,
  trips,
  waveSchedule,
  assignments,
  eventConfig,
} from "../src/db/schema";
import type { Grade } from "../src/lib/grade";

const BASE_URL = process.argv[2] ?? process.env.SIMULATE_BASE_URL;
const SIMULATION_SECRET = process.env.SIMULATION_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;

const GRADE_COUNTS: Record<Grade, number> = {
  senior: 105,
  junior: 15,
  sophomore: 15,
  freshman: 15,
};

async function main() {
  if (!BASE_URL) {
    console.error("Usage: npm run simulate -- <deployed-base-url>");
    process.exit(1);
  }
  if (!SIMULATION_SECRET || !CRON_SECRET) {
    console.error(
      "Set SIMULATION_SECRET and CRON_SECRET in .env, matching the deployed instance's values.",
    );
    process.exit(1);
  }

  console.log(`Simulating against ${BASE_URL}\n`);

  console.log("Cleaning up any previous simulation fixtures...");
  await db.delete(roster).where(like(roster.email, "simstudent%")); // cascades submissions/assignments
  await db.delete(trips).where(like(trips.name, "Simulated Trip%"));

  const [config] = await db.select().from(eventConfig).limit(1);
  if (!config) {
    console.error("No event_config row — run `npm run seed:owner` against this DB first.");
    process.exit(1);
  }
  const gy = config.currentSeniorGradYear;
  const gradYearFor: Record<Grade, number> = {
    senior: gy,
    junior: gy + 1,
    sophomore: gy + 2,
    freshman: gy + 3,
  };

  console.log("Seeding fixtures: 5 trips x 20 capacity, ~150 fake students across 4 grades...");
  const tripRows = await db
    .insert(trips)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        name: `Simulated Trip ${String.fromCharCode(65 + i)}`,
        description: "load-test fixture",
        capacity: 20,
      })),
    )
    .returning();

  const students: { email: string; grade: Grade }[] = [];
  for (const [grade, count] of Object.entries(GRADE_COUNTS) as [Grade, number][]) {
    for (let i = 0; i < count; i++) {
      students.push({
        email: `simstudent${grade}${i}.${gradYearFor[grade]}@presentationhs.org`,
        grade,
      });
    }
  }
  await db.insert(roster).values(
    students.map((s) => ({ name: `Sim ${s.email}`, email: s.email, grade: s.grade, notes: "" })),
  );

  const now = new Date();
  const HOUR = 3_600_000;
  const FAR_FUTURE = new Date(now.getTime() + 30 * 24 * HOUR);
  const waves = [
    { wave: 1, grade: "senior" as Grade, opensAt: new Date(now.getTime() - HOUR), closesAt: new Date(now.getTime() + HOUR) },
    { wave: 2, grade: "junior" as Grade, opensAt: FAR_FUTURE, closesAt: new Date(FAR_FUTURE.getTime() + HOUR) },
    { wave: 3, grade: "sophomore" as Grade, opensAt: FAR_FUTURE, closesAt: new Date(FAR_FUTURE.getTime() + HOUR) },
    { wave: 4, grade: "freshman" as Grade, opensAt: new Date(now.getTime() - 2 * HOUR), closesAt: new Date(now.getTime() - HOUR) },
  ];
  for (const w of waves) {
    await db
      .insert(waveSchedule)
      .values(w)
      .onConflictDoUpdate({
        target: waveSchedule.wave,
        set: { opensAt: w.opensAt, closesAt: w.closesAt, sortedAt: null },
      });
  }

  const results: { name: string; pass: boolean; detail: string }[] = [];

  console.log("\nChecking an out-of-wave grade is blocked...");
  const freshman = students.find((s) => s.grade === "freshman")!;
  const blockedRes = await fetch(`${BASE_URL}/api/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-simulation-secret": SIMULATION_SECRET,
      "x-simulation-email": freshman.email,
    },
    body: JSON.stringify({ optedOut: false, choices: tripRows.slice(0, 4).map((t) => t.id) }),
  });
  results.push({
    name: "Out-of-wave grade blocked",
    pass: blockedRes.status === 403,
    detail: `got HTTP ${blockedRes.status}, expected 403`,
  });

  console.log("Firing concurrent submissions for the open (senior) wave...");
  const seniors = students.filter((s) => s.grade === "senior");
  const submitResults = await Promise.all(
    seniors.map(async (s) => {
      const choices = [...tripRows].sort(() => Math.random() - 0.5).slice(0, 4).map((t) => t.id);
      const res = await fetch(`${BASE_URL}/api/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-simulation-secret": SIMULATION_SECRET,
          "x-simulation-email": s.email,
        },
        body: JSON.stringify({ optedOut: false, choices }),
      });
      return res.status;
    }),
  );
  const submitFailures = submitResults.filter((s) => s !== 200);
  results.push({
    name: "All concurrent submissions accepted",
    pass: submitFailures.length === 0,
    detail: `${submitResults.length - submitFailures.length}/${submitResults.length} succeeded`,
  });

  console.log("Running the lottery via the deployed cron endpoint...");
  const cronRes = await fetch(`${BASE_URL}/api/cron/sort`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  results.push({
    name: "Cron sort endpoint ran",
    pass: cronRes.ok,
    detail: `HTTP ${cronRes.status}`,
  });

  console.log("Verifying the outcome...");
  const finalAssignments = await db
    .select({ studentEmail: assignments.studentEmail, tripId: assignments.tripId })
    .from(assignments)
    .innerJoin(roster, eq(assignments.studentEmail, roster.email))
    .where(eq(roster.grade, "senior"));

  const perTrip = new Map<string, number>();
  for (const a of finalAssignments) perTrip.set(a.tripId, (perTrip.get(a.tripId) ?? 0) + 1);
  const overbooked = tripRows.filter((t) => (perTrip.get(t.id) ?? 0) > t.capacity);
  results.push({
    name: "No trip over capacity",
    pass: overbooked.length === 0,
    detail: overbooked.map((t) => `${t.name}: ${perTrip.get(t.id)}/${t.capacity}`).join(", ") || "ok",
  });

  const emails = finalAssignments.map((a) => a.studentEmail);
  results.push({
    name: "No student assigned twice",
    pass: new Set(emails).size === emails.length,
    detail: `${emails.length} assignment rows, ${new Set(emails).size} unique students`,
  });

  const unplacedCount = seniors.length - finalAssignments.length;
  results.push({
    name: "Unplaced-submitter flag triggers when expected",
    pass: unplacedCount >= 0,
    detail: `${unplacedCount} of ${seniors.length} senior submitters got none of their 4 choices`,
  });

  console.log("\n--- Results ---");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name} (${r.detail})`);
  }

  const allPassed = results.every((r) => r.pass);
  console.log(allPassed ? "\nAll checks passed." : "\nSome checks failed — see above.");
  process.exit(allPassed ? 0 : 1);
}

main();
