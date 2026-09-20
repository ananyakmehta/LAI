import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { changeLog, eventConfig } from "@/db/schema";

/**
 * There is always exactly one row (id=1), created by `scripts/seed-owner.ts`
 * during setup. Grade derivation (§7) and the post-wave phase gates (§5)
 * all read from it.
 */
export async function getEventConfig() {
  const [row] = await db.select().from(eventConfig).limit(1);
  if (!row) {
    throw new Error(
      "event_config has no row yet — run `npm run seed:owner` first.",
    );
  }
  return row;
}

/**
 * Owner-only: the deliberate reveal step, separate from sorting itself.
 * Sorting (the lottery) can run per-wave any time after that grade's wave
 * closes; students see nothing until this fires, for every grade at once.
 * There's no "unrelease" — resetting the sim (moves.ts) is what clears it
 * back to null for a fresh test cycle.
 */
export async function releaseAssignments(who: string): Promise<{ releasedAt: Date }> {
  const releasedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(eventConfig).set({ assignmentsReleasedAt: releasedAt }).where(eq(eventConfig.id, 1));
    await tx.insert(changeLog).values({
      who,
      action: "release_assignments",
      toTrip: releasedAt.toISOString(),
    });
  });
  return { releasedAt };
}
