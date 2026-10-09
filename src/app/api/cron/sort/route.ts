import { NextResponse } from "next/server";
import { getAllWaveSchedule, gracedCloseTime } from "@/db/queries/waves";
import { getEventConfig } from "@/db/queries/event-config";
import { runLotteryPass1, runLotteryPass2 } from "@/lib/lottery";

/**
 * Vercel Cron target. Hobby plan allows once-daily cron frequency — which
 * means this is a best-effort BACKSTOP, not the real "5 minutes after the
 * deadline" trigger the 2026 brief calls for. A once-daily cron cannot hit
 * a precise 5-minute window; for real same-day accuracy, trigger Pass 1 /
 * Pass 2 manually from the admin dashboard's "Event operations" section at
 * the right time instead. This still catches either pass within the same
 * day if the manual trigger is missed.
 *
 * Pass 1 fires once per-grade senior/junior sortedAt is still null and the
 * senior wave's (priority) closesAt + grace has passed. Pass 2 fires once
 * sophomore/freshman sortedAt is still null and the shared
 * finalSubmissionDeadline + grace has passed.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const [schedule, eventConfig] = await Promise.all([getAllWaveSchedule(), getEventConfig()]);
  const seniorWave = schedule.find((w) => w.grade === "senior");
  const sophomoreWave = schedule.find((w) => w.grade === "sophomore");
  const results: unknown[] = [];

  if (seniorWave && seniorWave.sortedAt === null && gracedCloseTime(seniorWave.closesAt) <= now) {
    results.push(await runLotteryPass1("cron"));
  }

  if (
    sophomoreWave &&
    sophomoreWave.sortedAt === null &&
    eventConfig.finalSubmissionDeadline !== null &&
    gracedCloseTime(eventConfig.finalSubmissionDeadline) <= now
  ) {
    results.push(await runLotteryPass2("cron"));
  }

  return NextResponse.json({ ranPasses: results });
}
