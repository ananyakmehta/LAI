"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Grade } from "@/lib/grade";

const GRADES: { value: Grade; label: string }[] = [
  { value: "freshman", label: "Freshman" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
];

const WAVE_BY_GRADE: Record<Grade, number> = {
  senior: 1,
  junior: 2,
  sophomore: 3,
  freshman: 4,
};

interface TripOption {
  id: string;
  name: string;
}

export function SimulationPanel({ trips }: { trips: TripOption[] }) {
  return (
    <div className="flex flex-col gap-4">
      <AssignRankingsControl trips={trips} />
      <WaveControl />
      <SortControl />
      <ResetControl />
    </div>
  );
}

function GradeSelect({ value, onChange }: { value: Grade; onChange: (g: Grade) => void }) {
  return (
    <label className="flex flex-col gap-1">
      Grade
      <select
        className="rounded border border-petal bg-white p-1"
        value={value}
        onChange={(e) => onChange(e.target.value as Grade)}
      >
        {GRADES.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssignRankingsControl({ trips }: { trips: TripOption[] }) {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade>("freshman");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nonResponderCount, setNonResponderCount] = useState(0);
  const evenSplit = trips.length > 0 ? Math.round(100 / trips.length) : 0;
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(trips.map((t) => [t.id, evenSplit])),
  );
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const totalWeight = trips.reduce((sum, t) => sum + (weights[t.id] ?? 0), 0);

  async function run() {
    setStatus("running");
    setResult(null);
    const res = await fetch("/api/admin/simulate/assign-rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade, nonResponderCount, weights }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setResult(data.error ?? "Failed to assign rankings.");
      return;
    }
    setStatus("idle");
    const failedNote =
      data.failed.length > 0
        ? ` ${data.failed.length} failed — check that ${grade}'s wave is currently open (use "Start wave" below first).`
        : "";
    setResult(
      `${data.submitted}/${data.attempted} submitted, ${data.nonResponders.length} non-responders.${failedNote}`,
    );
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <h3 className="mb-2 font-medium text-plum">Assign random rankings + submit</h3>
      <div className="flex flex-wrap items-end gap-2">
        <GradeSelect value={grade} onChange={setGrade} />
        <button
          type="button"
          onClick={run}
          disabled={status === "running"}
          className="rounded bg-magenta px-3 py-1 text-white hover:bg-rose disabled:opacity-40"
        >
          {status === "running" ? "Submitting…" : "Assign + submit"}
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-plum/60 underline"
        >
          {showAdvanced ? "Hide advanced options" : "Advanced options"}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-3 flex flex-col gap-3 border-t border-petal pt-3">
          <label className="flex max-w-xs flex-col gap-1">
            Non-responders (random students who submit nothing)
            <input
              type="number"
              min={0}
              className="rounded border border-petal bg-white p-1"
              value={nonResponderCount}
              onChange={(e) => setNonResponderCount(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <div>
            <p className="mb-1 text-plum">
              Percent distribution (relative weight per trip) — total:{" "}
              <span className={totalWeight === 100 ? "text-green-700" : "text-red-600"}>
                {totalWeight}%
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              {trips.map((t) => (
                <label key={t.id} className="flex flex-col gap-1">
                  {t.name}
                  <input
                    type="number"
                    min={0}
                    className="w-24 rounded border border-petal bg-white p-1"
                    value={weights[t.id] ?? 0}
                    onChange={(e) =>
                      setWeights((w) => ({ ...w, [t.id]: Math.max(0, Number(e.target.value)) }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {result && (
        <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{result}</p>
      )}
    </div>
  );
}

function WaveControl() {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade>("freshman");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run(action: "start-wave" | "end-wave") {
    setStatus("running");
    setResult(null);
    const res = await fetch(`/api/admin/simulate/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wave: WAVE_BY_GRADE[grade] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setResult(data.error ?? "Failed.");
      return;
    }
    setStatus("idle");
    if (action === "start-wave") {
      setResult(
        `Wave ${WAVE_BY_GRADE[grade]} (${data.grade}) opened now — closes ${new Date(data.closesAt).toLocaleString()}.`,
      );
    } else {
      setResult(
        `Wave ${WAVE_BY_GRADE[grade]} (${data.grade}) will close at ${new Date(data.closesAt).toLocaleTimeString()} (20s buffer).`,
      );
    }
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <h3 className="mb-2 font-medium text-plum">Start / end wave</h3>
      <div className="flex flex-wrap items-end gap-2">
        <GradeSelect value={grade} onChange={setGrade} />
        <button
          type="button"
          onClick={() => run("start-wave")}
          disabled={status === "running"}
          className="rounded bg-magenta px-3 py-1 text-white hover:bg-rose disabled:opacity-40"
        >
          Start wave
        </button>
        <button
          type="button"
          onClick={() => run("end-wave")}
          disabled={status === "running"}
          className="rounded border border-rose px-3 py-1 hover:bg-petal disabled:opacity-40"
        >
          End wave (20s buffer)
        </button>
      </div>
      {result && (
        <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{result}</p>
      )}
    </div>
  );
}

function SortControl() {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade>("freshman");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    const res = await fetch("/api/admin/simulate/sort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wave: WAVE_BY_GRADE[grade] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setResult(data.error ?? "Failed.");
      return;
    }
    setStatus("idle");
    setResult(
      `${data.assignedCount} assigned, ${data.unplacedCount} unplaced of ${data.eligibleCount} eligible.`,
    );
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <h3 className="mb-2 font-medium text-plum">Sort</h3>
      <div className="flex flex-wrap items-end gap-2">
        <GradeSelect value={grade} onChange={setGrade} />
        <button
          type="button"
          onClick={run}
          disabled={status === "running"}
          className="rounded bg-magenta px-3 py-1 text-white hover:bg-rose disabled:opacity-40"
        >
          Run sort
        </button>
      </div>
      {result && (
        <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{result}</p>
      )}
    </div>
  );
}

function ResetControl() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    const res = await fetch("/api/admin/simulate/reset", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setResult(data.error ?? "Failed.");
      return;
    }
    setStatus("idle");
    setResult(
      `Cleared ${data.clearedAssignments} assignment(s) and ${data.clearedSubmissions} submission(s) across all grades.`,
    );
    router.refresh();
  }

  return (
    <div className="rounded border border-petal bg-white p-3 text-sm">
      <h3 className="mb-2 font-medium text-plum">Reset</h3>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={run}
          disabled={status === "running"}
          className="rounded bg-magenta px-3 py-1 text-white hover:bg-rose disabled:opacity-40"
        >
          Unassign + clear submissions (every grade)
        </button>
      </div>
      {result && (
        <p className={`mt-2 ${status === "error" ? "text-red-600" : "text-plum/70"}`}>{result}</p>
      )}
    </div>
  );
}
