"use client";

import { useState } from "react";
import {
  StateNotOpen,
  StateB,
  StateWaiting,
  StateOptedOut,
  StateMissed,
  StateUnplaced,
  StateD,
  type Trip,
  type SubmissionStatus,
} from "../../student-home";

const PREVIEW_OPTIONS = [
  { key: "NOT_OPEN", label: "Selection not open yet" },
  { key: "B", label: "Ranking form (wave open)" },
  { key: "WAITING", label: "Submitted, waiting for release" },
  { key: "OPTED_OUT", label: "Opted out, waiting for release" },
  { key: "MISSED", label: "Missed the deadline" },
  { key: "UNPLACED", label: "Released, no trip assigned" },
  { key: "D", label: "Released, assigned" },
] as const;

type PreviewKey = (typeof PREVIEW_OPTIONS)[number]["key"];

const now = () => new Date();
const hoursFromNow = (h: number) => new Date(now().getTime() + h * 60 * 60 * 1000).toISOString();

function noop() {
  // Preview-only — no network calls, no DB writes.
}

export function PreviewClient({ trips }: { trips: Trip[] }) {
  const [selected, setSelected] = useState<PreviewKey>("B");
  const sample = trips.slice(0, 4);
  const firstTrip = trips[0];

  const baseStatus: SubmissionStatus = {
    submission: null,
    waveOpen: false,
    grade: "senior",
    opensAt: null,
    closesAt: null,
    sortedAt: null,
    released: false,
    assignment: null,
  };

  const sampleSubmission = {
    optedOut: false,
    tripChoice1: sample[0]?.id ?? null,
    tripChoice2: sample[1]?.id ?? null,
    tripChoice3: sample[2]?.id ?? null,
    tripChoice4: sample[3]?.id ?? null,
    parent1Email: "parent1@example.com",
    parent1Phone: "555-0100",
    parent2Email: "parent2@example.com",
    parent2Phone: "555-0101",
  };

  const assignedTrip = firstTrip
    ? {
        tripName: firstTrip.name,
        description: firstTrip.description,
        facultyLead: firstTrip.facultyLead,
        startTime: firstTrip.startTime,
        endTime: firstTrip.endTime,
        travelMethod: firstTrip.travelMethod,
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PREVIEW_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSelected(opt.key)}
            className={`rounded border px-3 py-1 text-sm ${
              selected === opt.key
                ? "border-magenta bg-magenta text-background"
                : "border-rose text-blush hover:bg-petal hover:text-plum"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="rounded border border-petal p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blush/50">
          Preview - not real data
        </p>

        {selected === "NOT_OPEN" && <StateNotOpen trips={sample} />}

        {selected === "B" && (
          <StateB
            trips={sample}
            status={{ ...baseStatus, waveOpen: true, closesAt: hoursFromNow(48) }}
            closesAt={hoursFromNow(48)}
            onSaved={noop}
          />
        )}

        {selected === "WAITING" && <StateWaiting submission={sampleSubmission} trips={sample} />}

        {selected === "OPTED_OUT" && <StateOptedOut />}

        {selected === "MISSED" && <StateMissed trips={sample} />}

        {selected === "UNPLACED" && <StateUnplaced />}

        {selected === "D" && assignedTrip && (
          <StateD
            assignment={assignedTrip}
            changeRequestVisible={true}
            changeRequestWindowEndsAt={hoursFromNow(72)}
          />
        )}
      </div>
    </div>
  );
}
