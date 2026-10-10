"use client";

import { useState } from "react";

/**
 * Manual re-sync, independent of the automatic one that fires on release —
 * for re-running after a post-release roster move, or a retry if the
 * automatic sync failed.
 */
export function GoogleSheetSyncControl() {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setNote(null);
    const res = await fetch("/api/admin/sync-google-sheet", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setNote(data.error ?? "Sync failed.");
      return;
    }
    setStatus("idle");
    setNote(`Google Sheet updated (${data.rowCount} rows).`);
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <p className="mb-2 text-plum/70">
        Syncs automatically whenever you release trip assignments. Use this to push an
        up-to-date copy any other time, such as after moving a student afterward.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className="rounded bg-magenta px-3 py-1 text-plum hover:brightness-90 disabled:opacity-40"
      >
        {status === "running" ? "Syncing…" : "Sync to Google Sheet"}
      </button>
      {note && <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{note}</p>}
    </div>
  );
}
