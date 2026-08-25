import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, changeLog, trips } from "@/db/schema";

export async function getTripFillStatus(tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return null;
  const current = await db.select().from(assignments).where(eq(assignments.tripId, tripId));
  return { trip, filled: current.length };
}

/**
 * The one shared move implementation — used by both the CLI's
 * `move-student` and the admin dashboard's move UI, so there's exactly one
 * code path that writes an assignment + change_log row for a manual move
 * (§4's "how the assignment happened" guarantee doesn't hold if two
 * surfaces can each mutate this independently).
 */
export async function moveStudentToTrip(
  email: string,
  tripId: string,
  who: string,
): Promise<{ fromTripId: string | null }> {
  const [existing] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.studentEmail, email))
    .limit(1);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.delete(assignments).where(eq(assignments.studentEmail, email));
    }
    await tx.insert(assignments).values({
      studentEmail: email,
      tripId,
      assignmentMethod: "manual_admin_override",
    });
    await tx.insert(changeLog).values({
      who,
      action: "move_student",
      studentEmail: email,
      fromTrip: existing?.tripId ?? null,
      toTrip: tripId,
    });
  });

  return { fromTripId: existing?.tripId ?? null };
}
