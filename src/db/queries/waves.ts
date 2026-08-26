import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { waveSchedule } from "@/db/schema";
import type { Grade } from "@/lib/grade";
import type { TimePhase } from "@/lib/view-context";

export async function getWaveScheduleForGrade(grade: Grade) {
  const [row] = await db
    .select()
    .from(waveSchedule)
    .where(eq(waveSchedule.grade, grade))
    .limit(1);
  return row ?? null;
}

export async function getAllWaveSchedule() {
  return db.select().from(waveSchedule).orderBy(waveSchedule.wave);
}

/**
 * Wave-gating enforced by the system itself (§5) — not by controlling who
 * has the link. A student may submit/edit only while now is within their
 * own grade's [opensAt, closesAt) window.
 *
 * This is the STRICT window, matching the times actually communicated to
 * students (e.g. "closes 11:59 PM") — use this for anything UI-facing
 * (enabling/disabling the form, status messages), not for the actual write
 * enforcement below.
 */
export function isWindowOpen(
  wave: { opensAt: Date; closesAt: Date } | null,
  now: Date = new Date(),
): boolean {
  if (!wave) return false;
  return now >= wave.opensAt && now < wave.closesAt;
}

/**
 * A 5-minute buffer on each side of the strict window, absorbing
 * client/server clock skew and in-flight request latency at the boundary —
 * e.g. a student who clicks submit at 11:58:59 shouldn't get rejected
 * because the request lands at 12:00:01. The UI still only shows the form
 * as open/closed on the strict window (isWindowOpen above); this wider
 * window is deliberately backend-only, used for the actual accept/reject
 * decision on a submission and for how long the overnight sort waits
 * before treating a wave as truly closed.
 *
 * Exported so scripts/simulate-wave-cycle.ts can derive its own wait
 * buffer from whatever this is currently set to, rather than duplicating
 * the number — if you ever need to shrink this again for a short-wave
 * test run, remember to revert it back to `5 * 60 * 1000` afterward.
 */
export const GRACE_PERIOD_MS = 5 * 60 * 1000;

export function isSubmissionAccepted(
  wave: { opensAt: Date; closesAt: Date } | null,
  now: Date = new Date(),
): boolean {
  if (!wave) return false;
  const gracedOpen = wave.opensAt.getTime() - GRACE_PERIOD_MS;
  const gracedClose = wave.closesAt.getTime() + GRACE_PERIOD_MS;
  return now.getTime() >= gracedOpen && now.getTime() < gracedClose;
}

/** The timestamp the overnight sort should wait for before treating a wave as closed — see isSubmissionAccepted. */
export function gracedCloseTime(closesAt: Date): Date {
  return new Date(closesAt.getTime() + GRACE_PERIOD_MS);
}

const PHASE_OFFSET_MS = 60 * 60 * 1000; // 1 hour — comfortably outside the 5-min grace window either side

/**
 * A fake "now" for previewing a wave-relative state while simulating a
 * student (owner role-simulation, §"view as" — src/lib/view-context.ts).
 * Computed relative to that student's own grade's real wave_schedule row;
 * never writes to it, and only ever affects gating checks made for this
 * one simulated identity's own requests — every other student's real
 * gating is computed from the real clock, untouched.
 */
export function simulatedNowForPhase(
  wave: { opensAt: Date; closesAt: Date } | null,
  phase: TimePhase,
): Date {
  if (!wave) return new Date();
  if (phase === "before") return new Date(wave.opensAt.getTime() - PHASE_OFFSET_MS);
  if (phase === "after") return new Date(wave.closesAt.getTime() + PHASE_OFFSET_MS);
  return new Date((wave.opensAt.getTime() + wave.closesAt.getTime()) / 2);
}
