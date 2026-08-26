"use client";

import { useEffect, useState } from "react";

interface Trip {
  id: string;
  name: string;
  description: string;
  seatsRemaining: number;
  capacity: number;
  chaperoneTeacherEmail: string | null;
}

interface SubmissionStatus {
  submission: {
    optedOut: boolean;
    tripChoice1: string | null;
    tripChoice2: string | null;
    tripChoice3: string | null;
    tripChoice4: string | null;
  } | null;
  waveOpen: boolean;
  grade: string | null;
  opensAt: string | null;
  closesAt: string | null;
  sortedAt: string | null;
  assignment: { tripName: string } | null;
}

interface WaiverStatus {
  waiver: { uploadedAt: string } | null;
}

type StudentState = "A" | "B" | "C" | "D" | "UNPLACED";

function deriveState(status: SubmissionStatus): StudentState {
  if (status.assignment) return "D";
  if (status.sortedAt) return "UNPLACED";
  if (status.waveOpen) return "B";
  if (status.opensAt && Date.now() < new Date(status.opensAt).getTime()) return "A";
  return "C";
}

export function StudentHome({
  changeRequestVisible,
  changeRequestWindowEndsAt,
}: {
  changeRequestVisible: boolean;
  changeRequestWindowEndsAt: string | null;
}) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [waiver, setWaiver] = useState<WaiverStatus | null>(null);

  const reload = () => {
    Promise.all([
      fetch("/api/trips").then((r) => r.json()),
      fetch("/api/submissions").then((r) => r.json()),
      fetch("/api/waivers").then((r) => r.json()),
    ]).then(([tripsData, statusData, waiverData]) => {
      setTrips(tripsData.trips);
      setStatus(statusData);
      setWaiver(waiverData);
    });
  };

  useEffect(reload, []);

  if (!trips || !status || !waiver) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  const state = deriveState(status);

  return (
    <div className="flex flex-col gap-6">
      {state === "A" && <StateA trips={trips} opensAt={status.opensAt} />}
      {state === "B" && (
        <StateB trips={trips} status={status} closesAt={status.closesAt} onSaved={reload} />
      )}
      {state === "C" && <StateC />}
      {state === "UNPLACED" && <StateUnplaced />}
      {state === "D" && (
        <StateD
          assignment={status.assignment!}
          changeRequestVisible={changeRequestVisible}
          changeRequestWindowEndsAt={changeRequestWindowEndsAt}
        />
      )}

      {(state === "A" || state === "B" || state === "D") && (
        <WaiverUpload waiver={waiver.waiver} onUploaded={reload} />
      )}
    </div>
  );
}

function StateA({ trips, opensAt }: { trips: Trip[]; opensAt: string | null }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Trips</h2>
      {opensAt && (
        <p className="mb-3 text-sm text-gray-600">
          Your grade&apos;s signup opens {new Date(opensAt).toLocaleString(undefined, {
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      )}
      <ul className="flex flex-col gap-2 text-sm">
        {trips.map((t) => (
          <li key={t.id} className="rounded border p-3">
            <p className="font-medium">{t.name}</p>
            <p className="text-gray-600">{t.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateB({
  trips,
  status,
  closesAt,
  onSaved,
}: {
  trips: Trip[];
  status: SubmissionStatus;
  closesAt: string | null;
  onSaved: () => void;
}) {
  const existing = status.submission;
  const [optedOut, setOptedOut] = useState(existing?.optedOut ?? false);
  const [choices, setChoices] = useState<(string | null)[]>([
    existing?.tripChoice1 ?? null,
    existing?.tripChoice2 ?? null,
    existing?.tripChoice3 ?? null,
    existing?.tripChoice4 ?? null,
  ]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setChoice(index: number, tripId: string) {
    setChoices((prev) => {
      const next = [...prev];
      next[index] = tripId || null;
      return next;
    });
  }

  const chosenIds = choices.filter((c): c is string => c !== null);
  const hasDuplicates = new Set(chosenIds).size !== chosenIds.length;
  const isComplete = optedOut || chosenIds.length === 4;

  async function handleSubmit() {
    setSaveState("saving");
    setErrorMessage(null);
    const body = optedOut ? { optedOut: true as const } : { optedOut: false as const, choices };
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSaveState("saved");
      onSaved();
    } else {
      const data = await res.json();
      setSaveState("error");
      setErrorMessage(data.error === "wave_not_open" ? "Your window just closed." : "Something went wrong.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Your ranked choices</h2>
      {closesAt && (
        <p className="text-sm text-gray-600">
          Submit by {new Date(closesAt).toLocaleString(undefined, {
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={optedOut}
          onChange={(e) => setOptedOut(e.target.checked)}
        />
        I&apos;m not going
      </label>

      {!optedOut && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex flex-col gap-1 text-sm">
              Choice {i + 1}
              <select
                className="rounded border p-2"
                value={choices[i] ?? ""}
                onChange={(e) => setChoice(i, e.target.value)}
              >
                <option value="">Select a trip…</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.seatsRemaining}/{t.capacity} seats left)
                  </option>
                ))}
              </select>
            </label>
          ))}
          {hasDuplicates && <p className="text-sm text-red-600">Each choice must be different.</p>}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isComplete || hasDuplicates || saveState === "saving"}
        className="w-fit rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-40"
      >
        {saveState === "saving" ? "Saving…" : "Save"}
      </button>
      {saveState === "saved" && <p className="text-sm text-green-700">Saved — you can change this any time before the deadline.</p>}
      {saveState === "error" && errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <TripOptions trips={trips} />
    </section>
  );
}

/** Shown alongside the ranked-choice selection, per trip: name, chaperone, and description. */
function TripOptions({ trips }: { trips: Trip[] }) {
  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="mb-2 text-sm font-semibold">Trip options</h3>
      <ul className="flex flex-col gap-3 text-sm">
        {trips.map((t) => (
          <li key={t.id} className="rounded border p-3">
            <p className="font-medium">{t.name}</p>
            <p className="text-gray-600">
              Chaperone: {t.chaperoneTeacherEmail ?? "Not yet assigned"}
            </p>
            <p className="text-gray-600">{t.description || "Description coming soon."}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateC() {
  return (
    <section>
      <p className="text-sm text-gray-600">
        You&apos;re all set — results will be posted once sorting completes.
      </p>
    </section>
  );
}

function StateUnplaced() {
  return (
    <section>
      <p className="text-sm text-gray-600">
        Sorting has completed for your grade, but you don&apos;t have a trip assignment yet.
        Reach out to the event organizer.
      </p>
    </section>
  );
}

function StateD({
  assignment,
  changeRequestVisible,
  changeRequestWindowEndsAt,
}: {
  assignment: { tripName: string };
  changeRequestVisible: boolean;
  changeRequestWindowEndsAt: string | null;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Your trip</h2>
      <p className="text-xl">{assignment.tripName}</p>
      {changeRequestVisible && (
        <p className="text-xs text-gray-500">
          Need a change{changeRequestWindowEndsAt ? ` before ${new Date(changeRequestWindowEndsAt).toLocaleDateString()}` : ""}? Email the event organizer.
        </p>
      )}
    </section>
  );
}

function WaiverUpload({
  waiver,
  onUploaded,
}: {
  waiver: { uploadedAt: string } | null;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(false);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/waivers", { method: "POST", body: formData });
    setUploading(false);
    if (res.ok) onUploaded();
    else setError(true);
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h2 className="text-sm font-semibold">Waiver</h2>
      <a href="/waiver-template.pdf" className="w-fit text-sm underline">
        Download the waiver form
      </a>
      <input type="file" accept="application/pdf" onChange={handleUpload} className="text-sm" />
      {uploading && <p className="text-sm text-gray-600">Uploading…</p>}
      {error && <p className="text-sm text-red-600">Upload failed — make sure it&apos;s a PDF under 10MB.</p>}
      {waiver && <p className="text-sm text-green-700">Uploaded {new Date(waiver.uploadedAt).toLocaleString()}.</p>}
      {!waiver && !uploading && <p className="text-sm text-gray-600">No waiver uploaded yet.</p>}
    </section>
  );
}
