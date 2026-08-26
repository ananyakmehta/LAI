import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getActor, type Actor, type Role } from "@/lib/permissions";
import { getRosterByEmail } from "@/db/queries/roster";
import { getTripById } from "@/db/queries/trips";

export const VIEW_AS_COOKIE = "view_as";

export function roleSimulationEnabled(): boolean {
  return process.env.ROLE_SIMULATION_ENABLED === "true";
}

export type TimePhase = "before" | "during" | "after";

export interface SimulationTarget {
  role: Exclude<Role, "owner">;
  email?: string; // student only
  tripId?: string; // teacher only
  timePhase?: TimePhase; // student only — see simulatedNowForPhase in db/queries/waves.ts
}

export interface ViewContext {
  /** The real, authenticated actor — never spoofed by the cookie. */
  realActor: Actor;
  /** What to actually render/check for this request. */
  role: Role;
  email: string;
  teacherTripId: string | null;
  simulated: boolean;
  /** Student simulation only — a fake wave-relative clock for this identity's own gating checks, never touching real wave_schedule rows or other students. */
  timePhase: TimePhase | null;
}

/**
 * "View as" only ever changes what the OWNER's own session sees and, for
 * student simulation specifically, which identity a submission/waiver
 * write is attributed to (see resolveIdentity in those API routes). It
 * never weakens any real permission check — every mutating admin route
 * still authorizes off `realActor` via getActor(session.email), untouched
 * by this cookie. A non-owner's cookie (however it got there) is inert:
 * this function only ever honors it when realActor.role === "owner".
 */
export async function getViewContext(): Promise<ViewContext | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const realActor = await getActor(email);

  if (realActor.role !== "owner" || !roleSimulationEnabled()) {
    return {
      realActor,
      role: realActor.role,
      email: realActor.email,
      teacherTripId: realActor.teacherTripId,
      simulated: false,
      timePhase: null,
    };
  }

  const target = await readSimulationCookie();
  if (!target) {
    return {
      realActor,
      role: realActor.role,
      email: realActor.email,
      teacherTripId: realActor.teacherTripId,
      simulated: false,
      timePhase: null,
    };
  }

  if (target.role === "student" && target.email) {
    return {
      realActor,
      role: "student",
      email: target.email,
      teacherTripId: null,
      simulated: true,
      timePhase: target.timePhase ?? null,
    };
  }

  if (target.role === "teacher" && target.tripId) {
    return {
      realActor,
      role: "teacher",
      email: realActor.email,
      teacherTripId: target.tripId,
      simulated: true,
      timePhase: null,
    };
  }

  if (target.role === "staff_admin") {
    return {
      realActor,
      role: "staff_admin",
      email: realActor.email,
      teacherTripId: null,
      simulated: true,
      timePhase: null,
    };
  }

  // Malformed cookie — fall back to the real actor rather than guessing.
  return {
    realActor,
    role: realActor.role,
    email: realActor.email,
    teacherTripId: realActor.teacherTripId,
    simulated: false,
    timePhase: null,
  };
}

async function readSimulationCookie(): Promise<SimulationTarget | null> {
  const store = await cookies();
  const raw = store.get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.role === "student" || parsed.role === "teacher" || parsed.role === "staff_admin") {
      return parsed as SimulationTarget;
    }
    return null;
  } catch {
    return null;
  }
}

/** Validates a simulation target actually exists before it's ever stored. */
export async function validateSimulationTarget(
  target: SimulationTarget,
): Promise<string | null> {
  if (target.role === "student") {
    if (!target.email) return "Student simulation requires an email.";
    const row = await getRosterByEmail(target.email.toLowerCase());
    if (!row) return `${target.email} is not on the roster.`;
    return null;
  }
  if (target.role === "teacher") {
    if (!target.tripId) return "Teacher simulation requires a trip.";
    const trip = await getTripById(target.tripId);
    if (!trip) return "Trip not found.";
    return null;
  }
  if (target.role === "staff_admin") return null;
  return "Unknown role.";
}
