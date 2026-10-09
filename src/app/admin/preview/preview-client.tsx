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
  type WaiverStatus,
} from "../../student-home";

const PREVIEW_OPTIONS = [
  { key: "NOT_OPEN", label: "Selection not open yet" },
  { key: "B", label: "Ranking form (wave open)" },
  { key: "WAITING", label: "Submitted, waiting for release" },
  { key: "OPTED_OUT", label: "Opted out, waiting for release" },
  { key: "MISSED", label: "Missed the deadline" },
  { key: "UNPLACED", label: "Released, no trip assigned" },
  { key: "D_NO_WAIVER", label: "Released, assigned (no waiver)" },
  { key: "D_WAIVER_PENDING", label: "Released, assigned (waiver pending)" },
  { key: "D_WAIVER_DONE", label: "Released, assigned (waiver done)" },
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
    parentEmail: "parent@example.com",
    parentPhone: "555-0100",
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

  const noWaiver: WaiverStatus = { assignment: null };
  const waiverPending: WaiverStatus = {
    assignment: firstTrip
      ? {
          tripName: firstTrip.name,
          waiverRequired: true,
          waiverUrl: "https://example.com/waiver",
          waiverDescription: "Example waiver — complete the vendor's own release form before the trip.",
          acknowledged: false,
        }
      : null,
  };
  const waiverDone: WaiverStatus = waiverPending.assignment
    ? { assignment: { ...waiverPending.assignment, acknowledged: true } }
    : { assignment: null };

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
                ? "border-magenta bg-magenta text-white"
                : "border-rose hover:bg-petal"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="rounded border border-petal bg-blush p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-plum/50">
          Preview — not real data
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

        {selected === "D_NO_WAIVER" && assignedTrip && (
          <StateD
            assignment={assignedTrip}
            waiver={noWaiver.assignment}
            onWaiverChange={noop}
            changeRequestVisible={true}
            changeRequestWindowEndsAt={hoursFromNow(72)}
          />
        )}

        {selected === "D_WAIVER_PENDING" && assignedTrip && (
          <StateD
            assignment={assignedTrip}
            waiver={waiverPending.assignment}
            onWaiverChange={noop}
            changeRequestVisible={true}
            changeRequestWindowEndsAt={hoursFromNow(72)}
          />
        )}

        {selected === "D_WAIVER_DONE" && assignedTrip && (
          <StateD
            assignment={assignedTrip}
            waiver={waiverDone.assignment}
            onWaiverChange={noop}
            changeRequestVisible={true}
            changeRequestWindowEndsAt={hoursFromNow(72)}
          />
        )}
      </div>
    </div>
  );
}
