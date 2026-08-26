import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/permissions";
import { getSubmissionForStudent } from "@/db/queries/submissions";

/** Owner-only: raw ranked choices (trip IDs) for one student, for the admin dashboard's "View choices" row action. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await getActor(session.user.email);
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const submission = await getSubmissionForStudent(email.toLowerCase());
  return NextResponse.json({ submission });
}
