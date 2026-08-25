import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminRoles, changeLog, trips } from "@/db/schema";
import type { Role } from "@/lib/permissions";

export type GrantableRole = Exclude<Role, "student">;

/** admin_roles rows joined with trip name, for the access-management UI. */
export async function getAdminRolesList() {
  return db
    .select({
      email: adminRoles.email,
      role: adminRoles.role,
      tripId: adminRoles.tripId,
      tripName: trips.name,
    })
    .from(adminRoles)
    .leftJoin(trips, eq(trips.id, adminRoles.tripId))
    .orderBy(adminRoles.role, adminRoles.email);
}

/**
 * The one shared grant implementation — used by the CLI's `grant-role`
 * and the admin dashboard's access-management UI, same reasoning as
 * moves.ts: exactly one code path writes an admin_roles + change_log row
 * for a grant, so the two surfaces can't drift.
 */
export async function grantRole(
  email: string,
  role: GrantableRole,
  tripId: string | null,
  who: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(adminRoles)
      .values({ email, role, tripId })
      .onConflictDoUpdate({ target: adminRoles.email, set: { role, tripId } });
    await tx.insert(changeLog).values({
      who,
      action: "grant_role",
      studentEmail: email,
      toTrip: `${role}${tripId ? `:${tripId}` : ""}`,
    });
  });
}

export async function revokeRole(email: string, who: string): Promise<boolean> {
  const [existing] = await db.select().from(adminRoles).where(eq(adminRoles.email, email)).limit(1);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx.delete(adminRoles).where(eq(adminRoles.email, email));
    await tx.insert(changeLog).values({
      who,
      action: "revoke_role",
      studentEmail: email,
      fromTrip: `${existing.role}${existing.tripId ? `:${existing.tripId}` : ""}`,
    });
  });
  return true;
}
