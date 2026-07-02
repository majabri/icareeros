/**
 * fix/jobs-ux-feedback Fix 3 — filter company-level career pages that
 * masquerade as apply URLs. Users clicking "Apply" on those hit dead
 * ends. The validator rejects URLs whose path looks like a landing
 * page rather than a job-specific posting.
 */

const INVALID_APPLY_PATTERNS: RegExp[] = [
  /\/jobs\/?$/,           // ends in /jobs or /jobs/
  /\/careers\/?$/,        // ends in /careers
  /\/job-search\/?$/,     // job search pages
  /\/[a-z]{2}\/careers\/?$/, // localised careers pages (/en/careers)
  /\/positions\/?$/,      // some ATS use /positions
  /\/openings\/?$/,       // some ATS use /openings
];

/**
 * A valid apply URL has:
 *   - at least 3 path segments after the domain (indicative of a
 *     job-specific URL like /company/jobs/12345 or /en-US/Search/details/foo)
 *   - AND does not match any of INVALID_APPLY_PATTERNS
 */
export function isValidApplyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length < 3) return false;
    return !INVALID_APPLY_PATTERNS.some(p => p.test(url));
  } catch { return false; }
}
