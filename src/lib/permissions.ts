import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminRoles } from "@/db/schema";

export type Role = "owner" | "staff_admin" | "teacher" | "student";

export interface Actor {
  email: string;
  role: Role;
  /** Only set when role === "teacher" — the trip they're chaperoning. */
  teacherTripId: string | null;
}

/**
 * Always re-reads admin_roles from the DB rather than trusting anything
 * cached in a session/JWT — per §12 step 7, permission checks must be
 * enforced server-side at request time, not just hidden in the UI. A role
 * revoked mid-session takes effect on the very next request.
 */
export async function getActor(email: string): Promise<Actor> {
  const normalized = email.toLowerCase();
  const [row] = await db
    .select()
    .from(adminRoles)
    .where(eq(adminRoles.email, normalized))
    .limit(1);

  if (!row) {
    return { email: normalized, role: "student", teacherTripId: null };
  }

  return {
    email: normalized,
    role: row.role,
    teacherTripId: row.role === "teacher" ? row.tripId : null,
  };
}

/**
 * Centralized tier -> capability -> boolean check (§6's table, §6's
 * "extensibility note"). Keep this the single place capability logic lives:
 * a future year widening a capability to another tier is a one-line change
 * here, not a redesign.
 */
export const can = {
  viewNonResponders(actor: Actor): boolean {
    return actor.role === "owner" || actor.role === "staff_admin";
  },

  viewNamesEmails(actor: Actor, tripId: string): boolean {
    if (actor.role === "owner" || actor.role === "staff_admin") return true;
    if (actor.role === "teacher") return actor.teacherTripId === tripId;
    return false;
  },

  moveAnyStudent(actor: Actor): boolean {
    return actor.role === "owner";
  },

  editTripCapacity(actor: Actor): boolean {
    return actor.role === "owner";
  },

  grantRevokeAccess(actor: Actor): boolean {
    return actor.role === "owner";
  },

  forceRerunLottery(actor: Actor): boolean {
    return actor.role === "owner";
  },

  releaseAssignments(actor: Actor): boolean {
    return actor.role === "owner";
  },

  importRosterCsv(actor: Actor): boolean {
    return actor.role === "owner";
  },

  exportRoster(actor: Actor, tripId?: string): boolean {
    if (actor.role === "owner" || actor.role === "staff_admin") return true;
    if (actor.role === "teacher" && tripId) return actor.teacherTripId === tripId;
    return false;
  },
};
