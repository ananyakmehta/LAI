import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, roster, trips } from "@/db/schema";

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

/** Names only (§6: "See their own trip's roster (names)") — not emails. */
export async function getTripRosterNames(tripId: string) {
  const rows = await db
    .select({ name: roster.name })
    .from(assignments)
    .innerJoin(roster, eq(roster.email, assignments.studentEmail))
    .where(eq(assignments.tripId, tripId));
  return rows.map((r) => r.name);
}
