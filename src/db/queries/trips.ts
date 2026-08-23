import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments, trips } from "@/db/schema";

/**
 * Counts only — never names (§3's deliberate anti-leaderboard rule).
 * seats_filled/seats_remaining are always computed from `assignments`, never
 * stored, so they can never drift out of sync (§4).
 */
export async function getTripsWithCounts() {
  const rows = await db
    .select({
      id: trips.id,
      name: trips.name,
      description: trips.description,
      capacity: trips.capacity,
      seatsFilled: sql<number>`count(${assignments.id})`.mapWith(Number),
    })
    .from(trips)
    .leftJoin(assignments, eq(assignments.tripId, trips.id))
    .groupBy(trips.id);

  return rows.map((row) => ({
    ...row,
    seatsRemaining: row.capacity - row.seatsFilled,
  }));
}

export async function getTripById(tripId: string) {
  const [row] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return row ?? null;
}
