"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Trip {
  id: string;
  name: string;
  seatsRemaining: number;
  capacity: number;
}

interface SubmissionState {
  optedOut: boolean;
  choices: (string | null)[]; // length 4
}

export default function SubmitPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [waveOpen, setWaveOpen] = useState<boolean | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [state, setState] = useState<SubmissionState>({
    optedOut: false,
    choices: [null, null, null, null],
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then((data) => setTrips(data.trips));

    fetch("/api/submissions")
      .then((r) => r.json())
      .then((data) => {
        setWaveOpen(data.waveOpen);
        setGrade(data.grade);
        if (data.submission) {
          setState({
            optedOut: data.submission.optedOut,
            choices: [
              data.submission.tripChoice1,
              data.submission.tripChoice2,
              data.submission.tripChoice3,
              data.submission.tripChoice4,
            ],
          });
        }
      });
  }, []);

  function setChoice(index: number, tripId: string) {
    setState((prev) => {
      const choices = [...prev.choices];
      choices[index] = tripId || null;
      return { ...prev, choices };
    });
  }

  const chosenIds = state.choices.filter((c): c is string => c !== null);
  const hasDuplicates = new Set(chosenIds).size !== chosenIds.length;
  const isComplete = state.optedOut || chosenIds.length === 4;

  async function handleSubmit() {
    setStatus("saving");
    setErrorMessage(null);

    const body = state.optedOut
      ? { optedOut: true as const }
      : { optedOut: false as const, choices: state.choices };

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setStatus("saved");
    } else {
      const data = await res.json();
      setStatus("error");
      setErrorMessage(
        data.error === "wave_not_open"
          ? "Your grade's submission window isn't open right now."
          : "Something went wrong — please try again.",
      );
    }
  }

  if (!trips || waveOpen === null) {
    return <main className="p-8">Loading…</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">Your ranked choices</h1>

      {!waveOpen && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {grade
            ? `The submission window for ${grade}s isn't open right now. You can still see the trip list, but you can't submit or edit until it opens.`
            : "You're not on the roster, so you can't submit choices."}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.optedOut}
          disabled={!waveOpen}
          onChange={(e) =>
            setState((prev) => ({ ...prev, optedOut: e.target.checked }))
          }
        />
        I&apos;m opting out of Learning in Action Day
      </label>

      {!state.optedOut && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex flex-col gap-1 text-sm">
              Choice {i + 1}
              <select
                className="rounded border p-2"
                disabled={!waveOpen}
                value={state.choices[i] ?? ""}
                onChange={(e) => setChoice(i, e.target.value)}
              >
                <option value="">Select a trip…</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name} ({trip.seatsRemaining}/{trip.capacity} seats
                    left)
                  </option>
                ))}
              </select>
            </label>
          ))}
          {hasDuplicates && (
            <p className="text-sm text-red-600">
              Each choice must be a different trip.
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!waveOpen || !isComplete || hasDuplicates || status === "saving"}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-40"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>

      {status === "saved" && (
        <p className="text-sm text-green-700">
          Saved. You can come back and change this any time before the
          window closes.
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </main>
  );
}
