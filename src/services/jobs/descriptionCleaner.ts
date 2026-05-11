/**
 * Job-description cleaner — Wave 1 of COWORK-BRIEF-jobs-experience-v1.
 *
 * Strip aggregator attribution from job descriptions before they reach the
 * user. Adzuna (and other aggregators) often inject "Job ID: 1234567",
 * "Req ID: …", tracking URLs, and explicit "via Adzuna" / "Posted on
 * Indeed" lines into the body text. The user should never see who the
 * upstream source is or what their internal ID is.
 *
 * Conservative regex set — only removes the explicit attribution markers
 * and tracking URLs. Leaves all other description content untouched. Idempotent.
 */
export function cleanJobDescription(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  return raw
    // "Job ID: 1234567" / "Job ID 1234567" / "Job#: 1234567"
    .replace(/\bJob\s*ID[\s#:]+[\w\-/]+/gi, "")
    // "Requisition ID" / "Req ID" / "Req. ID" / "Reqs ID"
    .replace(/\bReq(?:uisition|s)?\.?\s*ID[\s#:]+[\w\-/]+/gi, "")
    // Aggregator name mentions (standalone words, not inside URLs we've
    // already dropped below)
    .replace(/\b(adzuna|indeed|ziprecruiter|monster|careerbuilder|simplyhired|jobs2careers|appcast|jobspider|talentify|hireology|glassdoor)\b/gi, "")
    // Tracking / aggregator URLs (catch redirect.adzuna.com, indeed.com/rc/clk?…)
    .replace(/https?:\/\/[^\s]*(?:adzuna|track|click|indeed\.com\/rc|jobs?\.[a-z]+\/redirect)[^\s]*/gi, "")
    // "via Adzuna" / "Posted on Adzuna" leftovers
    .replace(/\b(?:via|posted\s+on|sourced\s+from)\s+(?:adzuna|indeed|ziprecruiter|monster|glassdoor)\b/gi, "")
    // Collapse runs of 3+ blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    // Trim double-spaces left by removed words
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
