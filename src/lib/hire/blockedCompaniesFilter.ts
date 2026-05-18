/**
 * Phase 2 recruiter discoverability (2026-05-17) — Pure helper for
 * server-side blocked_companies enforcement.
 *
 * RLS on career_profiles can't see WHICH employer is asking, so the
 * API route filters discoverable rows by comparing the recruiter's
 * company against each row's `blocked_companies` text[] here.
 *
 * Case-insensitive exact match — "Acme Corp" blocks "acme corp" too,
 * but does NOT block "Acme Corporation" (no substring match).
 */

export interface RowLike {
  blocked_companies?: unknown;
}

export function isBlockedFor<T extends RowLike>(row: T, viewerCompany: string): boolean {
  const blocks = Array.isArray(row.blocked_companies)
    ? (row.blocked_companies as unknown[]).filter(
        (b): b is string => typeof b === "string",
      )
    : [];
  const lc = viewerCompany.trim().toLowerCase();
  if (!lc) return false;
  return blocks.some((b) => b.toLowerCase() === lc);
}

export function filterByBlockedCompanies<T extends RowLike>(
  rows: T[],
  viewerCompany: string,
): T[] {
  if (!viewerCompany.trim()) return rows;
  return rows.filter((row) => !isBlockedFor(row, viewerCompany));
}
