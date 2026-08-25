// Seeds the DEV Supabase project with a small realistic dataset so the
// owner can explore the schema / run example SQL queries / click through
// the UI without touching production data. Point DATABASE_URL at the dev
// project before running this (never run against prod).

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { roster, trips, waveSchedule, eventConfig } from "../src/db/schema";
import type { Grade } from "../src/lib/grade";

const TRIP_NAMES = [
  ["Aquarium Day Trip", "Monterey Bay Aquarium, bus leaves at 8am."],
  ["Rock Climbing", "Indoor climbing gym, all skill levels."],
  ["Museum of Art", "SFMOMA guided tour."],
  ["Beach Cleanup", "Community service at Ocean Beach."],
  ["Escape Room Challenge", "Team-based puzzle rooms downtown."],
] as const;

async function main() {
  const [config] = await db.select().from(eventConfig).limit(1);
  const gy = config?.currentSeniorGradYear ?? 27;

  console.log("Resetting dev roster and this script's trips (full wipe, safe to re-run)...");
  await db.delete(roster); // cascades submissions/assignments/waivers
  for (const [name] of TRIP_NAMES) {
    await db.delete(trips).where(eq(trips.name, name)); // no-op if it doesn't exist yet
  }

  console.log("Seeding trips...");
  const tripRows = await db
    .insert(trips)
    .values(TRIP_NAMES.map(([name, description]) => ({ name, description, capacity: 22 })))
    .returning();

  console.log("Seeding roster: simstudent1..20 per grade...");
  const GRADE_OFFSET: Record<Grade, number> = { senior: 0, junior: 1, sophomore: 2, freshman: 3 };

  const rosterRows = [];
  for (const grade of Object.keys(GRADE_OFFSET) as Grade[]) {
    for (let i = 1; i <= 20; i++) {
      const gradYear = gy + GRADE_OFFSET[grade];
      const email = `simstudent${i}.${gradYear}@presentationhs.org`;
      rosterRows.push({ name: `Sim Student ${i}`, email, grade, notes: "" });
    }
  }
  await db.insert(roster).values(rosterRows);

  console.log("Seeding wave schedule (all placeholder — adjust with `npm run cli -- set-wave`)...");
  const now = new Date();
  const waves = [
    { wave: 1, grade: "senior" as Grade, opensAt: new Date(now.getTime() - 3600_000), closesAt: new Date(now.getTime() + 3600_000) },
    { wave: 2, grade: "junior" as Grade, opensAt: new Date(now.getTime() + 86_400_000), closesAt: new Date(now.getTime() + 2 * 86_400_000) },
    { wave: 3, grade: "sophomore" as Grade, opensAt: new Date(now.getTime() + 2 * 86_400_000), closesAt: new Date(now.getTime() + 3 * 86_400_000) },
    { wave: 4, grade: "freshman" as Grade, opensAt: new Date(now.getTime() + 3 * 86_400_000), closesAt: new Date(now.getTime() + 4 * 86_400_000) },
  ];
  for (const w of waves) {
    await db
      .insert(waveSchedule)
      .values(w)
      .onConflictDoUpdate({ target: waveSchedule.wave, set: { opensAt: w.opensAt, closesAt: w.closesAt } });
  }

  console.log(`Done. ${tripRows.length} trips, ${rosterRows.length} roster rows.`);
  process.exit(0);
}

main();
