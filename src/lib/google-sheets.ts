import { JWT } from "google-auth-library";
import { getMasterOverview } from "@/db/queries/dashboard";

/**
 * Roster -> Google Sheet sync, via a service account (NOT the sign-in OAuth
 * client — reusing that client's scopes would put it through Google's
 * manual app-verification review). The target sheet must already exist and
 * be shared with the service account's email as an Editor; service accounts
 * have no Drive storage quota of their own, so this never tries to create
 * the file itself.
 */

const SHEET_TAB = "Roster";
const HEADER = ["Student", "Email", "Grade", "Parent contact", "Trip"];

function parentContact(parentEmail: string | null, parentPhone: string | null): string {
  return [parentEmail, parentPhone].filter(Boolean).join(" / ") || "";
}

function getClient(): JWT | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  return new JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function isGoogleSheetsSyncConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_ROSTER_ID,
  );
}

/**
 * Overwrites the whole tab with the current master roster, one row per
 * student. Clears first so a shrunk roster (a row removed, a student
 * reassigned away from a now-empty trip) doesn't leave stale trailing rows
 * behind.
 */
export async function syncRosterToGoogleSheet(): Promise<{ rowCount: number }> {
  const sheetId = process.env.GOOGLE_SHEETS_ROSTER_ID;
  const client = getClient();
  if (!client || !sheetId) {
    throw new Error(
      "Google Sheets sync is not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_ROSTER_ID.",
    );
  }

  const overview = await getMasterOverview();
  const rows = overview
    .map((r) => [
      r.name,
      r.email,
      r.grade,
      parentContact(r.parentEmail, r.parentPhone),
      r.assignedTripName ?? "",
    ])
    // Grouped into one clean contiguous block per trip (alphabetical by trip,
    // then by student name within it) so a teacher lead can just scroll to
    // their trip's block — unassigned students sort to the very end rather
    // than interleaving blank-trip rows between trip blocks.
    .sort((a, b) => {
      const tripA = a[4] || "￿";
      const tripB = b[4] || "￿";
      return tripA.localeCompare(tripB) || a[0].localeCompare(b[0]);
    });

  const values = [HEADER, ...rows];
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Google Sheets sync failed: could not obtain an access token.");

  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values`;

  const clearRes = await fetch(`${base}/${SHEET_TAB}!A1:Z10000:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!clearRes.ok) {
    throw new Error(`Google Sheets sync failed to clear the sheet: ${clearRes.status} ${await clearRes.text()}`);
  }

  const updateRes = await fetch(`${base}/${SHEET_TAB}!A1?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!updateRes.ok) {
    throw new Error(`Google Sheets sync failed to write values: ${updateRes.status} ${await updateRes.text()}`);
  }

  return { rowCount: rows.length };
}
