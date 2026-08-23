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
 */
export function isWindowOpen(
  wave: { opensAt: Date; closesAt: Date } | null,
  now: Date = new Date(),
): boolean {
  if (!wave) return false;
  return now >= wave.opensAt && now < wave.closesAt;
}
