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
  const match = email.match(GRAD_YEAR_PATTERN);
  if (!match) return null;

  const gradYear = Number(match[1]);
  const offset = gradYear - currentSeniorGradYear;

  if (offset < 0 || offset > 3) return null;
  return GRADE_BY_OFFSET[offset];
}
