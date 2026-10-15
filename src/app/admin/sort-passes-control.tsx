"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatGroups(groups: { label: string; eligibleCount: number; assignedCount: number; unplacedCount: number }[]) {
  return groups
    .map((g) => `${g.label}: ${g.assignedCount}/${g.eligibleCount} placed, ${g.unplacedCount} unplaced`)
    .join(" · ");
}

function PassButton({
  label,
  description,
  endpoint,
}: {
  label: string;
  description: string;
  endpoint: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    const res = await fetch(endpoint, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setResult(data.error ?? "Failed.");
      return;
    }
    setStatus("idle");
    setResult(formatGroups(data.groups));
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <h3 className="mb-1 font-medium text-plum">{label}</h3>
      <p className="mb-2 text-plum/70">{description}</p>
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className="rounded bg-magenta px-3 py-1 text-background hover:brightness-90 disabled:opacity-40"
      >
        {status === "running" ? "Running…" : `Run ${label}`}
      </button>
      {result && (
        <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{result}</p>
      )}
    </div>
  );
}

/**
 * Real event-day sorting controls — not simulation. The cron job is a
 * once-daily backstop that can't hit the brief's "5 minutes after the
 * deadline" precisely, so these manual buttons are how the timing
 * actually gets hit on the real day. Sorting itself is separate from
 * releasing results to students — see ReleaseAssignmentsControl.
 */
export function SortPassesControl() {
  return (
    <div className="flex flex-col gap-3">
      <PassButton
        label="Pass 1 - Senior, then Junior"
        description="Sorts seniors who submitted by their priority deadline first (full capacity), then juniors into what's left. Run 5 minutes after the senior/junior priority deadline."
        endpoint="/api/admin/sort-pass-1"
      />
      <PassButton
        label="Pass 2 - Sophomore + late Senior/Junior, then Freshman"
        description="Merges sophomores with any senior/junior who missed their priority deadline into one shuffled pool, then places freshmen after. Run 5 minutes after the final submission deadline."
        endpoint="/api/admin/sort-pass-2"
      />
      <PassButton
        label="Final sort - stragglers"
        description="Places anyone, any grade, who has a ranking in but no trip yet into whatever capacity remains - one shuffled pool, lowest priority. Safe to re-run; only picks up students still unassigned at the time. Use after the extended submission window closes."
        endpoint="/api/admin/sort-final"
      />
    </div>
  );
}
