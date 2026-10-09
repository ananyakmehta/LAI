"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Owner-only reveal step. Sorting itself already ran per grade (cron or
 * manual "Sort" in Simulation controls) — students don't see an assignment
 * until this fires, so the owner can review outcomes before anyone else
 * does. One button, all grades at once.
 */
export function ReleaseAssignmentsControl({ releasedAt }: { releasedAt: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setError(null);
    const res = await fetch("/api/admin/release-assignments", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setError(data.error ?? "Failed to release assignments.");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <p className="mb-2 text-plum/70">
        {releasedAt
          ? `Released ${new Date(releasedAt).toLocaleString()}. Re-running sort for a grade after this won't hide it again until you release once more.`
          : "Students won't see their trip assignment until you release it here — sorting can finish grade by grade without anyone seeing results early."}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className="rounded bg-magenta px-3 py-1 text-plum hover:bg-rose disabled:opacity-40"
      >
        {status === "running" ? "Releasing…" : releasedAt ? "Re-release trip assignments" : "Release trip assignments to all grades"}
      </button>
      {status === "error" && error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
