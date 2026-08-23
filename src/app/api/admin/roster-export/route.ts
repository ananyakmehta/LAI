import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { getMasterOverview } from "@/db/queries/dashboard";
import { rowsToCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tripId = new URL(request.url).searchParams.get("tripId") ?? undefined;
  const actor = await getActor(session.user.email);

  if (!can.exportRoster(actor, tripId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await getMasterOverview(tripId);
  const csv = rowsToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="roster-export.csv"`,
    },
  });
}
