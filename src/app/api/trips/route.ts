import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTripsWithCounts } from "@/db/queries/trips";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Counts only — every tier sees this, and it's the same for all of them
  // (§6). Never include names/emails here.
  const trips = await getTripsWithCounts();
  return NextResponse.json({ trips });
}
