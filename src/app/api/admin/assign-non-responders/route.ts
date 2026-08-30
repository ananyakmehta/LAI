import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getActor, can } from "@/lib/permissions";
import { assignNonRespondersToTrip } from "@/db/queries/moves";

const bodySchema = z.object({
  emails: z.array(z.string().email()).min(1),
  tripId: z.string().uuid(),
});

/**
 * The trip roster page's "Non-responders" checklist — owner-only, same
 * capability as the general Move tool (§6).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (!can.moveAnyStudent(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await assignNonRespondersToTrip(
      parsed.data.emails.map((e) => e.toLowerCase()),
      parsed.data.tripId,
      actor.email,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 },
    );
  }
}
