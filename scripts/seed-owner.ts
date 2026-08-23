// One-time bootstrap: creates the first `admin_roles` owner row (admin_roles
// can otherwise only be written by an existing owner — see §6) and the
// single event_config row grade-derivation depends on (§7).
//
// Usage: npm run seed:owner -- <currentSeniorGradYear>
// Requires OWNER_EMAIL to be set in .env to your real @presentationhs.org address.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { adminRoles, eventConfig } from "../src/db/schema";

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.error("Set OWNER_EMAIL in .env to your real @presentationhs.org address.");
    process.exit(1);
  }

  const gradYearArg = process.argv[2];
  const currentSeniorGradYear = Number(gradYearArg);
  if (!gradYearArg || Number.isNaN(currentSeniorGradYear)) {
    console.error("Usage: npm run seed:owner -- <currentSeniorGradYear>  (e.g. 27)");
    process.exit(1);
  }

  await db
    .insert(adminRoles)
    .values({ email: ownerEmail.toLowerCase(), role: "owner", tripId: null })
    .onConflictDoUpdate({
      target: adminRoles.email,
      set: { role: "owner", tripId: null },
    });

  const [existingConfig] = await db.select().from(eventConfig).limit(1);
  if (existingConfig) {
    await db
      .update(eventConfig)
      .set({ currentSeniorGradYear })
      .where(eq(eventConfig.id, existingConfig.id));
  } else {
    await db.insert(eventConfig).values({ id: 1, currentSeniorGradYear });
  }

  console.log(`Owner set: ${ownerEmail}`);
  console.log(`current_senior_grad_year set: ${currentSeniorGradYear}`);
  console.log(
    "Next: use `npm run cli -- set-wave` and `set-event-dates` to fill in the rest of the schedule.",
  );
  process.exit(0);
}

main();
