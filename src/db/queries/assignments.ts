import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, trips } from "@/db/schema";

// No student-facing "who else is on my trip" query here, deliberately —
// see the schema.ts comment on event_config: students must never see
// trip-mate names, at any point (DD_LAI_ui_spec.md §0). Teacher/admin
// trip-roster views use getMasterOverview (src/db/queries/dashboard.ts)
// instead, which is permission-scoped to those roles.

export async function getOwnAssignment(email: string) {
  const [row] = await db
    .select({
      tripId: assignments.tripId,
      tripName: trips.name,
      assignmentMethod: assignments.assignmentMethod,
    })
    .from(assignments)
    .innerJoin(trips, eq(trips.id, assignments.tripId))
    .where(eq(assignments.studentEmail, email))
    .limit(1);
  return row ?? null;
}
