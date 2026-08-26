import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { waveSchedule, changeLog } from "@/db/schema";
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

export const WAVE_GRADE: Record<number, Grade> = {
  1: "senior",
  2: "junior",
  3: "sophomore",
  4: "freshman",
};

/**
 * How long a manually-started wave (owner simulation control, see
 * src/app/admin/simulation-panel.tsx) stays open before it would
 * auto-close — deliberately generous so it never closes on its own
 * mid-test; the owner closes it explicitly via endWaveNow.
 */
const MANUAL_WAVE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * How long after an owner clicks "End wave" the window actually closes —
 * see endWaveNow's doc comment for why this can't be zero. Independent of
 * GRACE_PERIOD_MS; not something to keep in sync with it.
 */
export const END_WAVE_BUFFER_MS = 20 * 1000;

/**
 * Owner-only simulation control: opens a wave right now, regardless of its
 * previously configured dates — mirrors the CLI's `set-wave` but with the
 * timestamps chosen for you (now -> now+24h) instead of typed out. Resets
 * sortedAt so the wave reads as freshly opened for this test run.
 */
export async function startWaveNow(wave: number, who: string) {
  const grade = WAVE_GRADE[wave];
  if (!grade) throw new Error(`Wave must be 1-4, got ${wave}.`);

  const opensAt = new Date();
  const closesAt = new Date(opensAt.getTime() + MANUAL_WAVE_DURATION_MS);

  await db.transaction(async (tx) => {
    await tx
      .insert(waveSchedule)
      .values({ wave, grade, opensAt, closesAt, sortedAt: null })
      .onConflictDoUpdate({
        target: waveSchedule.wave,
        set: { opensAt, closesAt, sortedAt: null },
      });
    await tx.insert(changeLog).values({
      who,
      action: "set_wave",
      toTrip: `wave_${wave}:${opensAt.toISOString()}..${closesAt.toISOString()}`,
    });
  });

  return { grade, opensAt, closesAt };
}

/**
 * Owner-only simulation control: closes a wave with a short buffer rather
 * than at the exact moment of the click — closesAt = now would still
 * accept submissions for the next GRACE_PERIOD_MS (production: 5 minutes)
 * via isSubmissionAccepted's grace window, which would make an "End wave"
 * button feel broken during testing.
 */
export async function endWaveNow(wave: number, who: string) {
  const grade = WAVE_GRADE[wave];
  if (!grade) throw new Error(`Wave must be 1-4, got ${wave}.`);

  const [existing] = await db
    .select()
    .from(waveSchedule)
    .where(eq(waveSchedule.wave, wave))
    .limit(1);
  if (!existing) throw new Error(`Wave ${wave} (${grade}) hasn't been started yet.`);

  const closesAt = new Date(Date.now() + END_WAVE_BUFFER_MS);

  await db.transaction(async (tx) => {
    await tx.update(waveSchedule).set({ closesAt }).where(eq(waveSchedule.wave, wave));
    await tx.insert(changeLog).values({
      who,
      action: "set_wave",
      toTrip: `wave_${wave}:closes_${closesAt.toISOString()}`,
    });
  });

  return { grade, closesAt };
}
