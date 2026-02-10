import type { EmailCandidate } from "@sales-ai/core";

/**
 * Generate email candidates for a person at a given domain.
 *
 * Produces a ranked list of addresses that follow the most common
 * corporate email patterns, each tagged with a pattern name and a
 * baseline confidence score.
 */
export function generateEmailCandidates(
  firstName: string,
  lastName: string,
  domain: string,
): EmailCandidate[] {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();

  if (!f || !l || !domain) {
    return [];
  }

  // Skip pattern generation if names contain non-ASCII characters (e.g. Japanese)
  // since the resulting email addresses would be invalid.
  const ASCII_ONLY = /^[a-z0-9\-_.]+$/;
  if (!ASCII_ONLY.test(f) || !ASCII_ONLY.test(l)) {
    return [];
  }

  const fInitial = f[0];
  const lInitial = l[0];
  const d = domain.toLowerCase().trim();

  const candidates: EmailCandidate[] = [
    {
      email: `${f}.${l}@${d}`,
      pattern: "firstname.lastname",
      confidence: 0.8,
    },
    {
      email: `${l}.${f}@${d}`,
      pattern: "lastname.firstname",
      confidence: 0.8,
    },
    {
      email: `${l}@${d}`,
      pattern: "lastname",
      confidence: 0.7,
    },
    {
      email: `${fInitial}${l}@${d}`,
      pattern: "f+lastname",
      confidence: 0.6,
    },
    {
      email: `${l}${fInitial}@${d}`,
      pattern: "lastname+f",
      confidence: 0.6,
    },
    {
      email: `${f}_${l}@${d}`,
      pattern: "firstname_lastname",
      confidence: 0.5,
    },
    {
      email: `${f}@${d}`,
      pattern: "firstname",
      confidence: 0.4,
    },
    {
      email: `${lInitial}${f}@${d}`,
      pattern: "l+firstname",
      confidence: 0.3,
    },
  ];

  return candidates;
}
