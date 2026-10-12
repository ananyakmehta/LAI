export const SCHOOL_DOMAIN = "presentationhs.org";

export type Grade = "senior" | "junior" | "sophomore" | "freshman";

const GRADE_BY_OFFSET: readonly Grade[] = [
  "senior",
  "junior",
  "sophomore",
  "freshman",
];

// Email format: [first initial][lastname][optional digit].[2-digit grad
// year]@presentationhs.org — e.g. amehta.27@presentationhs.org (§7).
const GRAD_YEAR_PATTERN = /\.(\d{2})@[^@]+$/;

// One-off, owner-confirmed exceptions where a student's email grad-year
// suffix doesn't match their actual current grade (e.g. a retained student
// whose school email was never reissued) — not a guess, each entry here was
// explicitly confirmed. Keyed by lowercased email. Checked before the normal
// grad-year parsing below, so it overrides rather than fights it.
const GRADE_OVERRIDES: Readonly<Record<string, Grade>> = {
  "hforzano.26@presentationhs.org": "senior", // confirmed 2026-10-12: a senior, special case
};

/**
 * Derives grade from the graduation-year suffix in the email, relative to
 * `currentSeniorGradYear` (§7). Returns null if the email doesn't match the
 * expected format, or the offset is out of the valid 0-3 range (graduated
 * or otherwise invalid — reject at login rather than guessing).
 */
export function gradeFromEmail(
  email: string,
  currentSeniorGradYear: number,
): Grade | null {
  const override = GRADE_OVERRIDES[email.toLowerCase()];
  if (override) return override;

  const match = email.match(GRAD_YEAR_PATTERN);
  if (!match) return null;

  const gradYear = Number(match[1]);
  const offset = gradYear - currentSeniorGradYear;

  if (offset < 0 || offset > 3) return null;
  return GRADE_BY_OFFSET[offset];
}
