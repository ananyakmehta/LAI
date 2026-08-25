import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { waveSchedule } from "@/db/schema";
import type { Grade } from "@/lib/grade";

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
 */
const GRACE_PERIOD_MS = 5 * 60 * 1000;

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
