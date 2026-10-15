import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { runFinalSort } from "@/lib/lottery";

/**
 * Owner-only: manually trigger the final straggler pass — everyone across
 * every grade with a ranking in but no assignment yet, one shuffled pool,
 * lowest priority against whatever capacity Pass 1/2 left behind. See
 * sort-pass-1's doc comment for why this is a real, always-available
 * control rather than a simulation-gated one.
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
    const result = await runFinalSort(actor.email);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 },
    );
  }
}
