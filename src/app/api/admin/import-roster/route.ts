import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { importRosterFromCsv } from "@/db/queries/roster";

/**
 * Owner-only roster upload — the same shared import used by the CLI's
 * `import-roster`, so a student who never signs in still ends up in the
 * roster table (and therefore counted as a non-responder) rather than
 * invisible.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (!can.importRosterCsv(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const csvText = await file.text();
  try {
    const count = await importRosterFromCsv(csvText, actor.email);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json(
      { error: "import_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
