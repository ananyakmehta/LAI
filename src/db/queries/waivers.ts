import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { waivers } from "@/db/schema";

export async function getWaiverAcknowledgment(email: string, tripId: string) {
  const [row] = await db
    .select()
    .from(waivers)
    .where(and(eq(waivers.studentEmail, email), eq(waivers.tripId, tripId)))
    .limit(1);
  return row ?? null;
}

/**
 * Waivers aren't files we host — a row here just means "this student says
 * they've completed their assigned trip's external waiver." Keyed by
 * (student, trip), so un-checking just deletes the row rather than storing
 * a false acknowledgment.
 */
export async function setWaiverAcknowledgment(
  email: string,
  tripId: string,
  acknowledged: boolean,
): Promise<void> {
  if (acknowledged) {
    await db
      .insert(waivers)
      .values({ studentEmail: email, tripId })
      .onConflictDoNothing({ target: [waivers.studentEmail, waivers.tripId] });
  } else {
    await db
      .delete(waivers)
      .where(and(eq(waivers.studentEmail, email), eq(waivers.tripId, tripId)));
  }
}
