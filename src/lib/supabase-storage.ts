import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Copy .env.example to .env and fill it in.",
  );
}

// Service-role client — bypasses RLS, server-only. Our own permission model
// (lib/permissions.ts) is the access-control layer, not Supabase RLS, so
// this key must never be exposed to the browser.
export const supabaseStorage = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

export const WAIVER_BUCKET = "waivers";

export function waiverStoragePath(studentEmail: string) {
  return `${studentEmail}.pdf`;
}
