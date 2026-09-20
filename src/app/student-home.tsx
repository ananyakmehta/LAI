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

interface SubmissionRecord {
  optedOut: boolean;
  tripChoice1: string | null;
  tripChoice2: string | null;
  tripChoice3: string | null;
  tripChoice4: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
}

interface SubmissionStatus {
  submission: SubmissionRecord | null;
  waveOpen: boolean;
  grade: string | null;
  opensAt: string | null;
  closesAt: string | null;
  sortedAt: string | null;
  released: boolean;
  assignment: { tripName: string } | null;
}

interface WaiverStatus {
  assignment: {
    tripName: string;
    waiverRequired: boolean;
    waiverUrl: string | null;
    waiverDescription: string | null;
    acknowledged: boolean;
  } | null;
}

const ORGANIZER_EMAIL = "ananya.k.mehta@gmail.com";

// "MISSED"/"WAITING" split on whether a submission exists once the strict
// (front-end) deadline has passed — see waves.ts's isWindowOpen vs.
// isSubmissionAccepted doc comments. The backend still accepts a save
// during the grace buffer after this deadline; this state split is purely
// about what the page SHOWS, computed once at load (no polling), which is
// exactly why a student mid-edit when the deadline passes isn't yanked
// off the ranking screen — they only see this on their next page load.
type StudentState = "A" | "B" | "WAITING" | "MISSED" | "D" | "UNPLACED";

function deriveState(status: SubmissionStatus): StudentState {
  // Assignment/sort outcomes are withheld until the owner releases them
  // (see the API route's own gating) — sortedAt being set doesn't mean
  // the student sees anything different yet.
  if (status.released && status.assignment) return "D";
  if (status.released && status.sortedAt && !status.assignment) return "UNPLACED";

  const closesAtMs = status.closesAt ? new Date(status.closesAt).getTime() : null;
  if (closesAtMs !== null && Date.now() >= closesAtMs) {
    return status.submission ? "WAITING" : "MISSED";
  }
  if (status.waveOpen) return "B";
  if (status.opensAt && Date.now() < new Date(status.opensAt).getTime()) return "A";
  return "WAITING";
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
    return <p className="p-8 text-sm text-plum/60">Loading…</p>;
  }

  const state = deriveState(status);

  return (
    <div className="flex flex-col gap-6">
      {state === "A" && <StateA trips={trips} opensAt={status.opensAt} />}
      {state === "B" && (
        <StateB trips={trips} status={status} closesAt={status.closesAt} onSaved={reload} />
      )}
      {state === "WAITING" && <StateWaiting submission={status.submission!} trips={trips} />}
      {state === "MISSED" && <StateMissed trips={trips} />}
      {state === "UNPLACED" && <StateUnplaced />}
      {state === "D" && (
        <StateD
          assignment={status.assignment!}
          waiver={waiver.assignment}
          onWaiverChange={reload}
          changeRequestVisible={changeRequestVisible}
          changeRequestWindowEndsAt={changeRequestWindowEndsAt}
        />
      )}
    </div>
  );
}

function StateA({ trips, opensAt }: { trips: Trip[]; opensAt: string | null }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-plum">Trips</h2>
      {opensAt && (
        <p className="mb-3 text-sm text-plum/70">
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
          <li key={t.id} className="rounded border border-petal bg-white p-3">
            <p className="font-medium text-plum">{t.name}</p>
            <p className="text-plum/70">{t.description}</p>
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
  const [order, setOrder] = useState<string[]>(
    [existing?.tripChoice1, existing?.tripChoice2, existing?.tripChoice3, existing?.tripChoice4].filter(
      (c): c is string => !!c,
    ),
  );
  const [parentEmail, setParentEmail] = useState(existing?.parentEmail ?? "");
  const [parentPhone, setParentPhone] = useState(existing?.parentPhone ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleTrip(id: string) {
    setOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  const isComplete = optedOut || order.length === 4;

  async function handleSubmit() {
    setSaveState("saving");
    setErrorMessage(null);
    const body = optedOut
      ? { optedOut: true as const, parentEmail, parentPhone }
      : { optedOut: false as const, choices: order, parentEmail, parentPhone };
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
      <h2 className="text-lg font-semibold text-plum">Your ranked choices</h2>
      {closesAt && (
        <p className="text-sm text-plum/70">
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

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-4">
        <label className="flex flex-1 flex-col gap-1">
          Parent/guardian email
          <input
            type="email"
            className="rounded border border-petal bg-white p-2"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          Parent/guardian phone
          <input
            type="tel"
            className="rounded border border-petal bg-white p-2"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
          />
        </label>
      </div>

      {!optedOut && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-plum/70">
            Tap trips in the order you&apos;d prefer them — first tap is your #1 choice.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {trips.map((t) => {
              const rank = order.indexOf(t.id);
              const selected = rank !== -1;
              const disabled = !selected && order.length >= 4;
              return (
                <li key={t.id}>
                  <label
                    className={`flex items-start gap-3 rounded border p-3 ${
                      selected ? "border-magenta bg-petal/40" : "border-petal bg-white"
                    } ${disabled ? "opacity-50" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleTrip(t.id)}
                    />
                    <span
                      className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-semibold ${
                        selected ? "border-magenta bg-magenta text-white" : "border-plum/30"
                      }`}
                    >
                      {selected ? rank + 1 : ""}
                    </span>
                    <span>
                      <p className="font-medium text-plum">{t.name}</p>
                      <p className="text-plum/70">{t.description || "Description coming soon."}</p>
                      <p className="text-xs text-plum/60">
                        Chaperone: {t.chaperoneTeacherEmail ?? "Not yet assigned"} · {t.seatsRemaining}/
                        {t.capacity} seats left
                      </p>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isComplete || saveState === "saving"}
        className="w-fit rounded bg-magenta px-4 py-2 text-white hover:bg-rose disabled:opacity-40"
      >
        {saveState === "saving" ? "Saving…" : "Save"}
      </button>
      {saveState === "saved" && (
        <p className="text-sm text-green-700">
          Saved! You can change your selection any time before the deadline
          {closesAt
            ? ` at ${new Date(closesAt).toLocaleString(undefined, {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              })}`
            : ""}
          .
        </p>
      )}
      {saveState === "error" && errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </section>
  );
}

/** Shown once the deadline's passed for a student who did submit — lets them confirm what they chose while waiting on release. */
function StateWaiting({ submission, trips }: { submission: SubmissionRecord; trips: Trip[] }) {
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const choiceIds = [
    submission.tripChoice1,
    submission.tripChoice2,
    submission.tripChoice3,
    submission.tripChoice4,
  ];

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-plum/70">You&apos;re all set! Trip assignments will be posted soon.</p>
      {submission.optedOut ? (
        <p className="text-sm text-plum/70">You opted out of this event.</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {choiceIds.map((id, i) => {
            const trip = id ? tripById.get(id) : undefined;
            return (
              <li key={id ?? i} className="rounded border border-petal bg-white p-3">
                <p className="font-medium text-plum">
                  {i + 1}. {trip?.name ?? "Trip no longer listed"}
                </p>
                {trip?.description && <p className="text-plum/70">{trip.description}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Shown when the front-end deadline has passed and the student never submitted anything. */
function StateMissed({ trips }: { trips: Trip[] }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-plum/70">
        Sorting has ended for your grade. Please contact{" "}
        <a href={`mailto:${ORGANIZER_EMAIL}`} className="text-plum underline">
          {ORGANIZER_EMAIL}
        </a>
        .
      </p>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-plum">Trips</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {trips.map((t) => (
            <li key={t.id} className="rounded border border-petal bg-white p-3">
              <p className="font-medium text-plum">{t.name}</p>
              <p className="text-plum/70">{t.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StateUnplaced() {
  return (
    <section>
      <p className="text-sm text-plum/70">
        Sorting has completed for your grade, but you don&apos;t have a trip assignment yet. Please
        contact{" "}
        <a href={`mailto:${ORGANIZER_EMAIL}`} className="text-plum underline">
          {ORGANIZER_EMAIL}
        </a>
        .
      </p>
    </section>
  );
}

function StateD({
  assignment,
  waiver,
  onWaiverChange,
  changeRequestVisible,
  changeRequestWindowEndsAt,
}: {
  assignment: { tripName: string };
  waiver: WaiverStatus["assignment"];
  onWaiverChange: () => void;
  changeRequestVisible: boolean;
  changeRequestWindowEndsAt: string | null;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-plum">Your trip</h2>
      <p className="text-xl text-plum">{assignment.tripName}</p>
      {changeRequestVisible && (
        <p className="text-xs text-plum/60">
          Need a change{changeRequestWindowEndsAt ? ` before ${new Date(changeRequestWindowEndsAt).toLocaleDateString()}` : ""}? Email the event organizer.
        </p>
      )}
      {waiver && <TripWaiver waiver={waiver} onChange={onWaiverChange} />}
    </section>
  );
}

/**
 * Waivers are trip-specific and external — some trips (rock climbing, etc.)
 * have their own release form on the vendor's own site, so this is a link +
 * description + self-report checkbox, never a file upload. Trips that don't
 * need one just say so.
 */
function TripWaiver({
  waiver,
  onChange,
}: {
  waiver: NonNullable<WaiverStatus["assignment"]>;
  onChange: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle(acknowledged: boolean) {
    setSaving(true);
    setError(false);
    const res = await fetch("/api/waivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged }),
    });
    setSaving(false);
    if (res.ok) onChange();
    else setError(true);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-petal pt-4">
      <h3 className="text-sm font-semibold text-plum">Waiver</h3>
      {!waiver.waiverRequired ? (
        <p className="text-sm text-plum/70">No waiver required for this trip.</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {waiver.waiverDescription && <p className="text-plum/70">{waiver.waiverDescription}</p>}
          {waiver.waiverUrl && (
            <a
              href={waiver.waiverUrl}
              target="_blank"
              rel="noreferrer"
              className="w-fit text-plum underline"
            >
              Open the waiver form
            </a>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={waiver.acknowledged}
              disabled={saving}
              onChange={(e) => toggle(e.target.checked)}
            />
            I&apos;ve completed this waiver
          </label>
          {error && <p className="text-sm text-red-600">Something went wrong — try again.</p>}
        </div>
      )}
    </div>
  );
}
