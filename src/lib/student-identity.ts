import { getViewContext } from "@/lib/view-context";

/**
 * Resolves which student's identity a submissions/waivers write should be
 * attributed to. Two sources, checked in order:
 *
 * 1. The §13 load-test bypass (SIMULATION_SECRET header) — unrelated to
 *    owner role-simulation, kept separate since it doesn't require a
 *    session at all and is used by scripts/simulate.ts, not a browser.
 * 2. getViewContext() resolving to role "student" — this covers both a
 *    real student's own session AND an owner's "view as student"
 *    simulation identically, since both produce
 *    `{ role: "student", email: <that student's email> }`. No special
 *    casing needed for the simulated path.
 *
 * Returns null if neither applies — not signed in, or signed in as a
 * non-student role with no active student simulation (an owner/staff-
 * admin/teacher session, not simulating a student, correctly can't submit
 * a ranking or upload a waiver through this path).
 */
export async function resolveStudentIdentity(request: Request): Promise<string | null> {
  const simulationSecret = process.env.SIMULATION_SECRET;
  if (simulationSecret && request.headers.get("x-simulation-secret") === simulationSecret) {
    return request.headers.get("x-simulation-email");
  }

  const ctx = await getViewContext();
  if (ctx?.role === "student") return ctx.email;
  return null;
}
