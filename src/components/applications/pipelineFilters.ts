/**
 * Pure helpers for the Applications pipeline UI — filtering, sorting,
 * counting. Extracted so the logic is unit-testable without React.
 *
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

export type ApplicationStatus =
  | "researching"      // Brief B3 Task 14 — new status (after wishlist add, before applying)
  | "applying"         // legacy
  | "applied"          // legacy
  | "screening"        // Brief B3 Task 14 — new (recruiter screen call scheduled / done)
  | "interviewing"     // legacy
  | "final_round"      // Brief B3 Task 14 — new (final round / panel)
  | "offer"            // legacy
  | "accepted"         // Brief B3 Task 14 — new (offer accepted, awaiting start)
  | "rejected"         // legacy
  | "withdrawn";       // legacy

export const STATUS_ORDER: ReadonlyArray<ApplicationStatus> = [
  "researching", "applying", "applied",
  "screening",   "interviewing", "final_round",
  "offer", "accepted",
  "rejected", "withdrawn",
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  researching:  "Researching",
  applying:     "Applying",
  applied:      "Applied",
  screening:    "Screening",
  interviewing: "Interviewing",
  final_round:  "Final round",
  offer:        "Offer",
  accepted:     "Accepted",
  rejected:     "Rejected",
  withdrawn:    "Withdrawn",
};

export interface Application {
  id:           string;
  user_id:      string;
  cycle_id:     string | null;
  opportunity_id: string | null;
  job_title:    string;
  company:      string;
  job_url:      string | null;
  status:       ApplicationStatus;
  notes:        string | null;
  applied_at:   string;
  updated_at:   string;
}

export type SortKey = "applied_at_desc" | "applied_at_asc" | "status_asc";

export interface PipelineFilter {
  status?: ApplicationStatus | "all";
  query?:  string;
}

export interface PipelineCounts {
  total:        number;
  researching:  number;
  applying:     number;
  applied:      number;
  screening:    number;
  interviewing: number;
  final_round:  number;
  offer:        number;
  accepted:     number;
  rejected:     number;
  withdrawn:    number;
  /** Active = not in a terminal state (rejected / withdrawn). */
  active:       number;
}

/** Strict status-string predicate. Useful for sanitising user input. */
export function isApplicationStatus(s: unknown): s is ApplicationStatus {
  return typeof s === "string" &&
    (STATUS_ORDER as readonly string[]).includes(s);
}

/** Apply { status, query } filter — case-insensitive substring on title/company. */
export function filterApplications(
  rows: ReadonlyArray<Application>,
  f:    PipelineFilter,
): Application[] {
  let out = rows.slice();
  if (f.status && f.status !== "all") {
    out = out.filter(r => r.status === f.status);
  }
  if (f.query && f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    out = out.filter(r =>
      r.job_title.toLowerCase().includes(q) ||
      r.company.toLowerCase().includes(q),
    );
  }
  return out;
}

/** Stable sort by the chosen key. Returns a new array. */
export function sortApplications(
  rows: ReadonlyArray<Application>,
  key:  SortKey,
): Application[] {
  const out = rows.slice();
  if (key === "applied_at_asc") {
    out.sort((a, b) => Date.parse(a.applied_at) - Date.parse(b.applied_at));
  } else if (key === "status_asc") {
    out.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return Date.parse(b.applied_at) - Date.parse(a.applied_at);
    });
  } else {
    // applied_at_desc (default)
    out.sort((a, b) => Date.parse(b.applied_at) - Date.parse(a.applied_at));
  }
  return out;
}

/** Headline counters for the pipeline header card. */
export function countApplications(
  rows: ReadonlyArray<Application>,
): PipelineCounts {
  const c: PipelineCounts = {
    total: rows.length,
    researching: 0, applying: 0, applied: 0,
    screening: 0, interviewing: 0, final_round: 0,
    offer: 0, accepted: 0,
    rejected: 0, withdrawn: 0,
    active: 0,
  };
  for (const r of rows) {
    c[r.status]++;
    if (r.status !== "rejected" && r.status !== "withdrawn") c.active++;
  }
  return c;
}

// ── /jobs Track-application handoff ──────────────────────────────────────

/**
 * Payload written to sessionStorage by /jobs OpportunityCard's "Track" button.
 * /applications page reads this on mount, opens the add form pre-filled, and
 * clears the key.
 */
export interface IncomingTrackPayload {
  job_title:      string;
  company:        string;
  job_url?:       string | null;
  opportunity_id?: string | null;
}

export const INCOMING_TRACK_KEY = "applications:incomingTrack";

export function readIncomingTrack(): IncomingTrackPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(INCOMING_TRACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IncomingTrackPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.job_title !== "string" || typeof parsed.company !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearIncomingTrack(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(INCOMING_TRACK_KEY); } catch { /* private mode */ }
}

export function writeIncomingTrack(p: IncomingTrackPayload): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(INCOMING_TRACK_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
