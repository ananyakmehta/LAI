import { db } from "@/db/client";
import { eventConfig } from "@/db/schema";

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
