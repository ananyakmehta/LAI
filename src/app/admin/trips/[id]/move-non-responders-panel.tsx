"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FlaggedRow {
  name: string;
  email: string;
  notes: string;
}

const GRADE_LABELS: Record<string, string> = {
  senior: "Senior",
  junior: "Junior",
  sophomore: "Sophomore",
  freshman: "Freshman",
};

export function MoveNonRespondersPanel({
  tripId,
  tripName,
  capacity,
  filled,
  nonResponders,
}: {
  tripId: string;
  tripName: string;
  capacity: number;
  filled: number;
  nonResponders: { grade: string; rows: FlaggedRow[] }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const anyRows = nonResponders.some((g) => g.rows.length > 0);
  const spotsLeft = capacity - filled - selected.size;
  const overCapacity = spotsLeft < 0;

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
    setStatus("idle");
    setErrorMessage(null);
  }

  async function handleMove() {
    setStatus("saving");
    setErrorMessage(null);
    const res = await fetch("/api/admin/assign-non-responders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [...selected], tripId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setErrorMessage(data.error ?? "Failed to move students.");
      return;
    }
    setSelected(new Set());
    setStatus("idle");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <h2 className="mb-2 text-lg font-semibold text-blush">Non-responders</h2>
      {!anyRows ? (
        <p className="text-sm text-blush/60">None.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded border border-petal bg-white p-3 text-sm">
          {nonResponders.map((g) =>
            g.rows.length === 0 ? null : (
              <div key={g.grade}>
                <p className="mb-1 text-xs font-medium uppercase text-plum/60">
                  {GRADE_LABELS[g.grade] ?? g.grade}
                </p>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((r) => (
                    <li key={r.email}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.email)}
                          onChange={() => toggle(r.email)}
                          className="accent-magenta"
                        />
                        <span>
                          {r.name} ({r.email}){r.notes ? ` — notes: ${r.notes}` : ""}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-petal pt-3">
            <p className={overCapacity ? "font-medium text-red-600" : "text-plum"}>
              {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left in {tripName} after this move
            </p>
            <button
              type="button"
              onClick={handleMove}
              disabled={selected.size === 0 || overCapacity || status === "saving"}
              className="rounded bg-magenta px-3 py-1 text-plum hover:brightness-90 disabled:opacity-40"
            >
              {status === "saving" ? "Moving…" : "Move here"}
            </button>
            {errorMessage && <p className="w-full text-red-600">{errorMessage}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
