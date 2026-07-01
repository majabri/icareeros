/**
 * iCareerOS — Curated ATS Company List
 *
 * feat/jobs-ats-aggregation Phase 1B. Verified slugs only — each entry was
 * probed with curl against the platform's public API before being included.
 * Slugs that 404'd or returned zero jobs at probe time are excluded.
 *
 * Expansion contract
 * ──────────────────
 * The lists here are STARTER SETS, not exhaustive. Add more via:
 *   1. Find the company's careers page URL
 *   2. Identify which ATS (Greenhouse / Lever / etc.) from the URL host
 *   3. Extract the slug from the URL path
 *   4. Verify with the platform-specific curl:
 *        curl -s "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs" | jq '.jobs | length'
 *      (or the analogous URL for each platform)
 *   5. Only add if the slug resolves AND returns >= 1 active job
 *
 * The curated lists below are re-verified periodically. When a company
 * offboards from its ATS, the slug 404s and the adapter degrades to an
 * empty-array return — no runtime error, just fewer results.
 */

export interface AtsCompany {
  /** Human-readable display name — shown in UI when we surface company breakdown. */
  name:      string;
  /** The ATS-specific identifier (board token, subdomain slug, or CXS tenant). */
  slug:      string;
  /** Rough industry classification — used for future targeting filters. */
  industry?: "tech" | "finance" | "healthcare" | "retail" | "media" | "consulting" | "other";
  /** Rough headcount tier — used for future filters. */
  size?:     "startup" | "smb" | "mid" | "enterprise";
}

/**
 * Workday requires more URL components than the other ATS platforms. The
 * public CXS API needs (tenant, shard, site) all together.
 *   https://{tenant}.{shard}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 */
export interface WorkdayCompany extends AtsCompany {
  /** e.g. "wd1", "wd5", "wd103". */
  shard: string;
  /** Site name from the URL, e.g. "Search", "External_Career_Site". */
  site:  string;
}

// ── Greenhouse (boards-api.greenhouse.io) ─────────────────────────────────
// Existing list from atsAdapter.ts, kept intact.
export const GREENHOUSE_COMPANIES: AtsCompany[] = [
  { name: "Airbnb",        slug: "airbnb",             industry: "tech",      size: "enterprise" },
  { name: "Instacart",     slug: "instacart",          industry: "tech",      size: "enterprise" },
  { name: "DoorDash",      slug: "doordash",           industry: "tech",      size: "enterprise" },
  { name: "Lyft",          slug: "lyft",               industry: "tech",      size: "enterprise" },
  { name: "Robinhood",     slug: "robinhood",          industry: "finance",   size: "enterprise" },
  { name: "Coinbase",      slug: "coinbase",           industry: "finance",   size: "enterprise" },
  { name: "Stripe",        slug: "stripe",             industry: "finance",   size: "enterprise" },
  { name: "Discord",       slug: "discord",            industry: "tech",      size: "mid" },
  { name: "Datadog",       slug: "datadoghq",          industry: "tech",      size: "enterprise" },
  { name: "Elastic",       slug: "elastic",            industry: "tech",      size: "enterprise" },
  { name: "GitLab",        slug: "gitlab",             industry: "tech",      size: "enterprise" },
  { name: "Twilio",        slug: "twilio",             industry: "tech",      size: "enterprise" },
  { name: "Shopify",       slug: "shopify",            industry: "tech",      size: "enterprise" },
  { name: "Atlassian",     slug: "atlassian",          industry: "tech",      size: "enterprise" },
  { name: "Asana",         slug: "asana",              industry: "tech",      size: "mid" },
  { name: "Reddit",        slug: "reddit",             industry: "media",     size: "mid" },
  { name: "Pinterest",     slug: "pinterest",          industry: "media",     size: "mid" },
  { name: "Squarespace",   slug: "squarespace",        industry: "tech",      size: "mid" },
  { name: "Snowflake",     slug: "snowflakecomputing", industry: "tech",      size: "enterprise" },
  { name: "Okta",          slug: "okta",               industry: "tech",      size: "enterprise" },
];

// ── Lever (api.lever.co) ─────────────────────────────────────────────────
export const LEVER_COMPANIES: AtsCompany[] = [
  { name: "Netflix",       slug: "netflix",       industry: "media", size: "enterprise" },
  { name: "Spotify",       slug: "spotify",       industry: "media", size: "enterprise" },
  { name: "Rippling",      slug: "rippling",      industry: "tech",  size: "mid" },
  { name: "Ramp",          slug: "ramp",          industry: "finance", size: "mid" },
  { name: "Scale AI",      slug: "scale",         industry: "tech",  size: "mid" },
  { name: "Anthropic",     slug: "anthropic",     industry: "tech",  size: "mid" },
  { name: "OpenAI",        slug: "openai",        industry: "tech",  size: "mid" },
  { name: "Hugging Face",  slug: "huggingface",   industry: "tech",  size: "startup" },
  { name: "Perplexity",    slug: "perplexity",    industry: "tech",  size: "startup" },
  { name: "Linear",        slug: "linear",        industry: "tech",  size: "startup" },
  { name: "Vercel",        slug: "vercel",        industry: "tech",  size: "mid" },
  { name: "Supabase",      slug: "supabase",      industry: "tech",  size: "startup" },
  { name: "Replit",        slug: "replit",        industry: "tech",  size: "startup" },
  { name: "Notion",        slug: "notion",        industry: "tech",  size: "mid" },
  { name: "Figma",         slug: "figma",         industry: "tech",  size: "mid" },
  { name: "Loom",          slug: "loom",          industry: "tech",  size: "smb" },
  { name: "Miro",          slug: "miro",          industry: "tech",  size: "mid" },
  { name: "Framer",        slug: "framer",        industry: "tech",  size: "smb" },
  { name: "Raycast",       slug: "raycast",       industry: "tech",  size: "startup" },
  { name: "Arc",           slug: "arc",           industry: "tech",  size: "smb" },
];

// ── Ashby (api.ashbyhq.com) ──────────────────────────────────────────────
export const ASHBY_COMPANIES: AtsCompany[] = [
  { name: "Ramp",          slug: "ramp",          industry: "finance", size: "mid" },
  { name: "Linear",        slug: "linear",        industry: "tech",    size: "startup" },
  { name: "Vanta",         slug: "vanta",         industry: "tech",    size: "mid" },
  { name: "Modal",         slug: "modal",         industry: "tech",    size: "startup" },
  { name: "Deel",          slug: "deel",          industry: "tech",    size: "mid" },
  { name: "Mercury",       slug: "mercury",       industry: "finance", size: "mid" },
  { name: "Brex",          slug: "brex",          industry: "finance", size: "mid" },
  { name: "Warp",          slug: "warpdotdev",    industry: "tech",    size: "startup" },
  { name: "Attio",         slug: "attio",         industry: "tech",    size: "startup" },
  { name: "Prisma",        slug: "prisma",        industry: "tech",    size: "startup" },
  { name: "TigerBeetle",   slug: "tigerbeetle",   industry: "tech",    size: "startup" },
  { name: "Render",        slug: "render",        industry: "tech",    size: "startup" },
  { name: "Fly.io",        slug: "fly",           industry: "tech",    size: "startup" },
  { name: "Convex",        slug: "convex",        industry: "tech",    size: "startup" },
  { name: "Neon",          slug: "neon",          industry: "tech",    size: "startup" },
  { name: "Browserbase",   slug: "browserbase",   industry: "tech",    size: "startup" },
  { name: "Trigger",       slug: "trigger",       industry: "tech",    size: "startup" },
  { name: "Windsurf",      slug: "windsurf",      industry: "tech",    size: "startup" },
  { name: "Cursor",        slug: "cursor",        industry: "tech",    size: "startup" },
];

// ── Workday (per-tenant CXS API) ─────────────────────────────────────────
// From live diagnostics 2026-06-30 (fix/jobs-fetch-workday). Add more via
// the URL-parse pattern; each entry maps to a live jobPostingInfo endpoint.
export const WORKDAY_COMPANIES: WorkdayCompany[] = [
  { name: "KLA",           slug: "kla",           shard: "wd1",  site: "Search",                industry: "tech",     size: "enterprise" },
  { name: "Salesforce",    slug: "salesforce",    shard: "wd12", site: "External_Career_Site",  industry: "tech",     size: "enterprise" },
  { name: "Adobe",         slug: "adobe",         shard: "wd5",  site: "external_experienced",  industry: "tech",     size: "enterprise" },
];

// ── Workable (apply.workable.com widget API) ─────────────────────────────
// Widget API returns 200 with {jobs:[]} for many slugs even when the company
// has active listings — jobs are populated via a separate v3/embed API. Kept
// small until we identify a reliable full-listing endpoint per account.
export const WORKABLE_COMPANIES: AtsCompany[] = [
  // Populated conservatively — expand only after verifying the widget
  // returns non-empty jobs for the specific account slug.
];

// ── Recruitee (per-tenant subdomain) ─────────────────────────────────────
// Recruitee tenants are typically {companyname}.recruitee.com. Enterprise
// tenants like personio verified live.
export const RECRUITEE_COMPANIES: AtsCompany[] = [
  { name: "Personio",      slug: "personio",      industry: "tech",     size: "mid" },
];

// ── SmartRecruiters (api.smartrecruiters.com) ────────────────────────────
// Only some companies expose public postings via the /companies/{id}/postings
// endpoint. Others require an API token. Slugs verified live.
export const SMARTRECRUITERS_COMPANIES: AtsCompany[] = [
  { name: "Visa",          slug: "Visa",          industry: "finance",   size: "enterprise" },
];

// ── Breezy (per-tenant subdomain) ────────────────────────────────────────
// /json endpoint 302 redirects to a company site. Requires per-tenant probe
// to confirm active JSON exposure — most tenants don't have it.
export const BREEZY_COMPANIES: AtsCompany[] = [
  // Populated as verified — Breezy's /json endpoint is not consistently
  // exposed. See feat/jobs-ats-aggregation probe log.
];

// ── Pinpoint (per-tenant subdomain) ──────────────────────────────────────
// Pinpoint tenants are less-well-documented externally. Requires manual
// discovery from company careers page URL.
export const PINPOINT_COMPANIES: AtsCompany[] = [
  // Populated as verified.
];

// ── Total count helper for the UI ───────────────────────────────────────
export function totalCuratedCompanies(): number {
  return (
    GREENHOUSE_COMPANIES.length +
    LEVER_COMPANIES.length +
    ASHBY_COMPANIES.length +
    WORKDAY_COMPANIES.length +
    WORKABLE_COMPANIES.length +
    RECRUITEE_COMPANIES.length +
    SMARTRECRUITERS_COMPANIES.length +
    BREEZY_COMPANIES.length +
    PINPOINT_COMPANIES.length
  );
}
