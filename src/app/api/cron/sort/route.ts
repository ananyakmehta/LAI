import { NextResponse } from "next/server";
import { getAllWaveSchedule } from "@/db/queries/waves";
import { runLotteryForWave } from "@/lib/lottery";

/**
 * Vercel Cron target (§10, §11). Hobby plan allows once-daily cron
 * frequency, which is all we need: check once a day whether any wave's
 * closes_at has passed without a sort having run yet, and run it if so.
 * Vercel injects `Authorization: Bearer $CRON_SECRET` automatically on
 * requests it makes to this route in production.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const schedule = await getAllWaveSchedule();
  const results = [];

  for (const wave of schedule) {
    if (wave.sortedAt !== null) continue;
    if (wave.closesAt > now) continue;
    results.push(await runLotteryForWave(wave.wave, "cron"));
  }

  return NextResponse.json({ ranWaves: results });
}
