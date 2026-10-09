import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { runLotteryPass1 } from "@/lib/lottery";

/**
 * Owner-only: manually trigger Pass 1 (senior, then junior — on-time
 * submitters only). Real event-day functionality, not gated behind
 * ROLE_SIMULATION_ENABLED — the cron job is a once-daily backstop, not a
 * precise "5 minutes after the deadline" trigger, so this is how the
 * owner actually hits that timing on the real day.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (!can.forceRerunLottery(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await runLotteryPass1(actor.email);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 },
    );
  }
}
