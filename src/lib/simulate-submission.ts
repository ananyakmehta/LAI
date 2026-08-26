/**
 * Submits one student's ranking through the REAL POST /api/submissions
 * route — same zod validation and wave-gating (isSubmissionAccepted) a
 * browser submission goes through, not a direct DB write — via the same
 * SIMULATION_SECRET header bypass the standalone load-test scripts use
 * (see scripts/simulate-wave-cycle.ts's submitFor). Used by the admin
 * "assign random rankings" simulation control so bulk test submissions
 * exercise the student-side process as faithfully as a single manual one.
 */
export async function submitSimulatedRanking(
  origin: string,
  email: string,
  tripIds: string[],
): Promise<{ ok: boolean; status: number; error?: string }> {
  const secret = process.env.SIMULATION_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "SIMULATION_SECRET is not configured" };
  }

  const res = await fetch(`${origin}/api/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-simulation-secret": secret,
      "x-simulation-email": email,
    },
    body: JSON.stringify({ optedOut: false, choices: tripIds }),
  });

  if (res.ok) return { ok: true, status: res.status };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, status: res.status, error: data.error ?? "unknown_error" };
}
