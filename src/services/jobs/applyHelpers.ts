/**
 * Apply-flow helpers — Wave 3.5.
 *
 * One pure surface to ask:
 *   - "What kind of apply path does this job have?"
 *   - "If I have to fall back to Google, what's the URL?"
 *   - "Auto-create a Pipeline row for this apply attempt."
 *
 * Keeping these out of the card / drawer components so the same logic
 * runs in both surfaces and stays unit-testable.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

export type ApplyMode = "direct" | "research";

export interface ApplyTarget {
  /** "direct" when we have a chased company URL; "research" when we don't. */
  mode: ApplyMode;
  /** URL to open in a new tab. Always set. */
  url: string;
  /** Button label to show the user. */
  label: string;
  /** Status to write to the applications table on click. */
  pipelineStatus: "applying" | "researching";
  /** Optional company hostname for the confirmation modal subtitle. */
  hostname: string | null;
}

/**
 * Resolve the apply target for an opportunity.
 *
 * Rule (Wave 3.5 — Option C tracked apply):
 *   - If `apply_url_company` is set → direct apply at the company / ATS.
 *   - Otherwise → fall back to a Google search so the button is NEVER
 *     disabled. The user always has an actionable next step.
 */
export function resolveApplyTarget(opp: Pick<
  OpportunityResult,
  "apply_url_company" | "title" | "company"
>): ApplyTarget {
  const chased = opp.apply_url_company || null;
  const company = (opp.company || "this company").trim();

  if (chased) {
    let hostname: string | null = null;
    try { hostname = new URL(chased).hostname.replace(/^www\./, ""); } catch { /* keep null */ }
    return {
      mode:           "direct",
      url:            chased,
      label:          `✈ Apply at ${company} →`,
      pipelineStatus: "applying",
      hostname,
    };
  }

  // Fallback: Google "<title> <company> careers apply" — opens to a SERP
  // the user can pick from. Always works, always something to click.
  const query = `${opp.title ?? ""} ${company} careers apply`.trim().replace(/\s+/g, " ");
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return {
    mode:           "research",
    url,
    label:          "🔎 Find & Apply →",
    pipelineStatus: "researching",
    hostname:       "google.com",
  };
}

/**
 * Auto-save the apply attempt to the user's pipeline.
 *
 * Posts to /api/applications. Best-effort — UI continues to navigate
 * the user to the apply URL even if the insert fails (we don't block
 * application flow on tracking). Errors are surfaced to the caller so
 * the toast layer can adjust the message ("Opened apply link" instead
 * of "Saved to your Pipeline").
 */
export async function autoSaveApplication(opp: Pick<
  OpportunityResult,
  "id" | "title" | "company" | "apply_url_company" | "url"
>, target: ApplyTarget): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/applications", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_title:     opp.title || "",
        company:       opp.company || "",
        job_url:       opp.apply_url_company || opp.url || target.url,
        opportunity_id: typeof opp.id === "string" ? opp.id : null,
        status:        target.pipelineStatus,
        notes:         target.mode === "research"
                         ? "Auto-saved via /jobs Find & Apply (Google fallback)."
                         : `Auto-saved via /jobs Apply. Destination: ${target.hostname ?? target.url}`,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, error: j?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
