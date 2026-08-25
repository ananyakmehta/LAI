import { NextResponse } from "next/server";
import { getRosterByEmail } from "@/db/queries/roster";
import { getWaiverForStudent, upsertWaiver } from "@/db/queries/waivers";
import { resolveStudentIdentity } from "@/lib/student-identity";
import {
  supabaseStorage,
  WAIVER_BUCKET,
  waiverStoragePath,
} from "@/lib/supabase-storage";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET(request: Request) {
  const email = await resolveStudentIdentity(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const waiver = await getWaiverForStudent(email);
  return NextResponse.json({ waiver });
}

export async function POST(request: Request) {
  const email = await resolveStudentIdentity(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Waiver upload isn't wave-gated — students may need to upload it any
  // time (§3 tracks it independently of ranking status).
  const rosterRow = await getRosterByEmail(email);
  if (!rosterRow) {
    return NextResponse.json({ error: "not_a_student" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "must_be_pdf" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const path = waiverStoragePath(email);
  const { error } = await supabaseStorage.storage
    .from(WAIVER_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: true });

  if (error) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  await upsertWaiver(email, path);
  return NextResponse.json({ ok: true });
}
