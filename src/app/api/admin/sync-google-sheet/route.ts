import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { syncRosterToGoogleSheet, isGoogleSheetsSyncConfigured } from "@/lib/google-sheets";

/**
 * Owner-only manual trigger — re-run after any post-release roster move, or
 * any time, independent of the automatic sync that fires on release.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (!can.releaseAssignments(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isGoogleSheetsSyncConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets sync is not configured. Set the GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_ROSTER_ID env vars." },
      { status: 400 },
    );
  }

  try {
    const result = await syncRosterToGoogleSheet();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
