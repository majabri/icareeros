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
  { name: "Lyft",          slug: "lyft",               industry: "tech",      size: "enterprise" },
  { name: "Robinhood",     slug: "robinhood",          industry: "finance",   size: "enterprise" },
  { name: "Coinbase",      slug: "coinbase",           industry: "finance",   size: "enterprise" },
  { name: "Stripe",        slug: "stripe",             industry: "finance",   size: "enterprise" },
  { name: "Discord",       slug: "discord",            industry: "tech",      size: "mid" },
  { name: "Elastic",       slug: "elastic",            industry: "tech",      size: "enterprise" },
  { name: "GitLab",        slug: "gitlab",             industry: "tech",      size: "enterprise" },
  { name: "Twilio",        slug: "twilio",             industry: "tech",      size: "enterprise" },
  { name: "Asana",         slug: "asana",              industry: "tech",      size: "mid" },
  { name: "Reddit",        slug: "reddit",             industry: "media",     size: "mid" },
  { name: "Pinterest",     slug: "pinterest",          industry: "media",     size: "mid" },
  { name: "Squarespace",   slug: "squarespace",        industry: "tech",      size: "mid" },
  { name: "Okta",          slug: "okta",               industry: "tech",      size: "enterprise" },
  // ── feat/jobs-multi-industry-coverage additions ──
  { name: 'Carta'                                 , slug: 'carta'                         , industry: 'finance'     , size: 'smb'        },   // greenhouse: 49 jobs
  { name: 'Betterment'                            , slug: 'betterment'                    , industry: 'finance'     , size: 'smb'        },   // greenhouse: 34 jobs
  { name: 'Marqeta'                               , slug: 'marqeta'                       , industry: 'finance'     , size: 'smb'        },   // greenhouse: 33 jobs
  { name: 'Nubank'                                , slug: 'nubank'                        , industry: 'finance'     , size: 'mid'        },   // greenhouse: 102 jobs
  { name: 'Toast'                                 , slug: 'toast'                         , industry: 'finance'     , size: 'mid'        },   // greenhouse: 287 jobs
  { name: 'SoFi'                                  , slug: 'sofi'                          , industry: 'finance'     , size: 'mid'        },   // greenhouse: 94 jobs
  { name: 'Affirm'                                , slug: 'affirm'                        , industry: 'finance'     , size: 'mid'        },   // greenhouse: 177 jobs
  { name: 'Chime'                                 , slug: 'chime'                         , industry: 'finance'     , size: 'smb'        },   // greenhouse: 64 jobs
  { name: 'Jump Trading'                          , slug: 'jumptrading'                   , industry: 'finance'     , size: 'smb'        },   // greenhouse: 58 jobs
  { name: 'Akuna Capital'                         , slug: 'akunacapital'                  , industry: 'finance'     , size: 'smb'        },   // greenhouse: 27 jobs
  { name: 'Virtu Financial'                       , slug: 'virtu'                         , industry: 'finance'     , size: 'smb'        },   // greenhouse: 36 jobs
  { name: 'Honor'                                 , slug: 'honor'                         , industry: 'healthcare'  , size: 'startup'    },   // greenhouse: 17 jobs
  { name: 'IMC Trading'                           , slug: 'imc'                           , industry: 'finance'     , size: 'mid'        },   // greenhouse: 145 jobs
  { name: 'One Medical'                           , slug: 'onemedical'                    , industry: 'healthcare'  , size: 'enterprise' },   // greenhouse: 334 jobs
  { name: 'Oscar Health'                          , slug: 'oscar'                         , industry: 'healthcare'  , size: 'mid'        },   // greenhouse: 266 jobs
  { name: 'Zocdoc'                                , slug: 'zocdoc'                        , industry: 'healthcare'  , size: 'smb'        },   // greenhouse: 50 jobs
  { name: 'Talkspace'                             , slug: 'talkspace'                     , industry: 'healthcare'  , size: 'startup'    },   // greenhouse: 10 jobs
  { name: 'Zscaler'                               , slug: 'zscaler'                       , industry: 'tech'        , size: 'enterprise' },   // greenhouse: 320 jobs
  { name: 'Cloudflare'                            , slug: 'cloudflare'                    , industry: 'tech'        , size: 'mid'        },   // greenhouse: 239 jobs
  { name: 'Mixpanel'                              , slug: 'mixpanel'                      , industry: 'tech'        , size: 'smb'        },   // greenhouse: 37 jobs
  { name: 'PagerDuty'                             , slug: 'pagerduty'                     , industry: 'tech'        , size: 'smb'        },   // greenhouse: 24 jobs
  { name: 'Amplitude'                             , slug: 'amplitude'                     , industry: 'tech'        , size: 'smb'        },   // greenhouse: 48 jobs
  { name: 'Dashlane'                              , slug: 'dashlane'                      , industry: 'tech'        , size: 'smb'        },   // greenhouse: 24 jobs
  { name: 'New Relic'                             , slug: 'newrelic'                      , industry: 'tech'        , size: 'smb'        },   // greenhouse: 55 jobs
  { name: 'Braze'                                 , slug: 'braze'                         , industry: 'tech'        , size: 'mid'        },   // greenhouse: 229 jobs
  { name: 'MongoDB'                               , slug: 'mongodb'                       , industry: 'tech'        , size: 'enterprise' },   // greenhouse: 397 jobs
  { name: 'Dragos'                                , slug: 'dragos'                        , industry: 'tech'        , size: 'smb'        },   // greenhouse: 30 jobs
  { name: 'Riot Games'                            , slug: 'riotgames'                     , industry: 'media'       , size: 'mid'        },   // greenhouse: 166 jobs
  { name: 'Epic Games'                            , slug: 'epicgames'                     , industry: 'media'       , size: 'mid'        },   // greenhouse: 127 jobs
  { name: 'Thoughtworks'                          , slug: 'thoughtworks'                  , industry: 'consulting'  , size: 'smb'        },   // greenhouse: 72 jobs
  { name: 'Roblox'                                , slug: 'roblox'                        , industry: 'media'       , size: 'mid'        },   // greenhouse: 231 jobs
  { name: 'Glossier'                              , slug: 'glossier'                      , industry: 'retail'      , size: 'startup'    },   // greenhouse: 19 jobs
  { name: 'Peloton'                               , slug: 'peloton'                       , industry: 'retail'      , size: 'smb'        },   // greenhouse: 61 jobs
  { name: 'Vox Media'                             , slug: 'voxmedia'                      , industry: 'media'       , size: 'startup'    },   // greenhouse: 12 jobs
  { name: 'BuzzFeed'                              , slug: 'buzzfeed'                      , industry: 'media'       , size: 'startup'    },   // greenhouse: 6 jobs
  { name: 'Adyen'                                 , slug: 'adyen'                         , industry: 'finance'     , size: 'mid'        },   // greenhouse: 208 jobs
  { name: 'Databricks'                            , slug: 'databricks'                    , industry: 'tech'        , size: 'enterprise' },   // greenhouse: 791 jobs
  { name: 'Monzo'                                 , slug: 'monzo'                         , industry: 'finance'     , size: 'smb'        },   // greenhouse: 67 jobs
  { name: 'BCG'                                   , slug: 'bcg'                           , industry: 'consulting'  , size: 'startup'    },   // greenhouse: 14 jobs
  { name: 'TCS'                                   , slug: 'tcs'                           , industry: 'consulting'  , size: 'smb'        },   // greenhouse: 77 jobs
];

// ── Lever (api.lever.co) ─────────────────────────────────────────────────
export const LEVER_COMPANIES: AtsCompany[] = [
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
  // ── feat/jobs-multi-industry-coverage additions ──
];

// ── Ashby (api.ashbyhq.com) ──────────────────────────────────────────────
export const ASHBY_COMPANIES: AtsCompany[] = [
  { name: "Ramp",          slug: "ramp",          industry: "finance", size: "mid" },
  { name: "Linear",        slug: "linear",        industry: "tech",    size: "startup" },
  { name: "Vanta",         slug: "vanta",         industry: "tech",    size: "mid" },
  { name: "Modal",         slug: "modal",         industry: "tech",    size: "startup" },
  { name: "Attio",         slug: "attio",         industry: "tech",    size: "startup" },
  { name: "Render",        slug: "render",        industry: "tech",    size: "startup" },
  { name: "Neon",          slug: "neon",          industry: "tech",    size: "startup" },
  { name: "Browserbase",   slug: "browserbase",   industry: "tech",    size: "startup" },
  { name: "Cursor",        slug: "cursor",        industry: "tech",    size: "startup" },
  // ── feat/jobs-multi-industry-coverage additions ──
  { name: 'Method'                                , slug: 'method'                        , industry: 'finance'     , size: 'startup'    },   // ashby: 12 jobs
  { name: 'Persona'                               , slug: 'persona'                       , industry: 'finance'     , size: 'smb'        },   // ashby: 24 jobs
  { name: 'Column'                                , slug: 'column'                        , industry: 'finance'     , size: 'startup'    },   // ashby: 16 jobs
  { name: 'Abridge'                               , slug: 'abridge'                       , industry: 'healthcare'  , size: 'smb'        },   // ashby: 54 jobs
  { name: 'Writer'                                , slug: 'writer'                        , industry: 'tech'        , size: 'smb'        },   // ashby: 49 jobs
  { name: 'Character AI'                          , slug: 'character'                     , industry: 'tech'        , size: 'startup'    },   // ashby: 16 jobs
  { name: 'Midjourney'                            , slug: 'midjourney'                    , industry: 'tech'        , size: 'startup'    },   // ashby: 11 jobs
  { name: 'PostHog'                               , slug: 'posthog'                       , industry: 'tech'        , size: 'smb'        },   // ashby: 21 jobs
  { name: 'Photoroom'                             , slug: 'photoroom'                     , industry: 'tech'        , size: 'startup'    },   // ashby: 14 jobs
  { name: 'Resend'                                , slug: 'resend'                        , industry: 'tech'        , size: 'startup'    },   // ashby: 8 jobs
  { name: 'LangChain'                             , slug: 'langchain'                     , industry: 'tech'        , size: 'mid'        },   // ashby: 102 jobs
  { name: 'Cohere'                                , slug: 'cohere'                        , industry: 'tech'        , size: 'mid'        },   // ashby: 127 jobs
  { name: 'ElevenLabs'                            , slug: 'elevenlabs'                    , industry: 'tech'        , size: 'mid'        },   // ashby: 144 jobs
  { name: 'Kalshi'                                , slug: 'kalshi'                        , industry: 'finance'     , size: 'smb'        },   // ashby: 34 jobs
  { name: 'Whoop'                                 , slug: 'whoop'                         , industry: 'healthcare'  , size: 'mid'        },   // ashby: 158 jobs
  { name: 'Drata'                                 , slug: 'drata'                         , industry: 'tech'        , size: 'smb'        },   // ashby: 52 jobs
];

// ── Workday (per-tenant CXS API) ─────────────────────────────────────────
// From live diagnostics 2026-06-30 (fix/jobs-fetch-workday). Add more via
// the URL-parse pattern; each entry maps to a live jobPostingInfo endpoint.
export const WORKDAY_COMPANIES: WorkdayCompany[] = [
  { name: "KLA",           slug: "kla",           shard: "wd1",  site: "Search",                industry: "tech",     size: "enterprise" },
  { name: "Salesforce",    slug: "salesforce",    shard: "wd12", site: "External_Career_Site",  industry: "tech",     size: "enterprise" },
  { name: "Adobe",         slug: "adobe",         shard: "wd5",  site: "external_experienced",  industry: "tech",     size: "enterprise" },
  // ── feat/jobs-expand-workday-smartrecruiters additions ──
  { name: 'Accenture'                     , slug: 'accenture'             , shard: 'wd103' , site: 'AccentureCareers'              , industry: 'consulting'  , size: 'enterprise' },   // verified 2026-07-06: 2000 jobs
  { name: 'Boeing'                        , slug: 'boeing'                , shard: 'wd1'   , site: 'EXTERNAL_CAREERS'              , industry: 'other'       , size: 'enterprise' },   // verified 2026-07-06: 1018 jobs
  { name: 'Capital One'                   , slug: 'capitalone'            , shard: 'wd12'  , site: 'Capital_One'                   , industry: 'finance'     , size: 'enterprise' },   // verified 2026-07-06: 1431 jobs
  { name: 'CVS Health'                    , slug: 'cvshealth'             , shard: 'wd1'   , site: 'CVS_Health_Careers'            , industry: 'healthcare'  , size: 'enterprise' },   // verified 2026-07-06: 16603 jobs
  { name: 'Disney'                        , slug: 'disney'                , shard: 'wd5'   , site: 'disneycareer'                  , industry: 'media'       , size: 'enterprise' },   // verified 2026-07-06: 613 jobs
  { name: 'HPE'                           , slug: 'hpe'                   , shard: 'wd5'   , site: 'Jobsathpe'                     , industry: 'tech'        , size: 'enterprise' },   // verified 2026-07-06: 1174 jobs
  { name: 'Intel'                         , slug: 'intel'                 , shard: 'wd1'   , site: 'External'                      , industry: 'tech'        , size: 'enterprise' },   // verified 2026-07-06: 626 jobs
  { name: 'Mastercard'                    , slug: 'mastercard'            , shard: 'wd1'   , site: 'CorporateCareers'              , industry: 'finance'     , size: 'enterprise' },   // verified 2026-07-06: 1148 jobs
  { name: 'Morgan Stanley'                , slug: 'ms'                    , shard: 'wd5'   , site: 'External'                      , industry: 'finance'     , size: 'enterprise' },   // verified 2026-07-06: 1354 jobs
  { name: 'Pfizer'                        , slug: 'pfizer'                , shard: 'wd1'   , site: 'PfizerCareers'                 , industry: 'healthcare'  , size: 'mid'        },   // verified 2026-07-06: 495 jobs
  { name: 'PwC'                           , slug: 'pwc'                   , shard: 'wd3'   , site: 'Global_Experienced_Careers'    , industry: 'consulting'  , size: 'enterprise' },   // verified 2026-07-06: 4403 jobs
  { name: 'State Street'                  , slug: 'statestreet'           , shard: 'wd1'   , site: 'Global'                        , industry: 'finance'     , size: 'enterprise' },   // verified 2026-07-06: 1068 jobs
  { name: 'Target'                        , slug: 'target'                , shard: 'wd5'   , site: 'targetcareers'                 , industry: 'retail'      , size: 'enterprise' },   // verified 2026-07-06: 2000 jobs
  { name: 'Travelers'                     , slug: 'travelers'             , shard: 'wd5'   , site: 'External'                      , industry: 'finance'     , size: 'mid'        },   // verified 2026-07-06: 322 jobs
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
  // ── feat/jobs-expand-workday-smartrecruiters additions ──
  { name: 'ASOS'                , slug: 'ASOS'                      , industry: 'other'       , size: 'smb'        },   // verified 2026-07-06: 57 jobs
  { name: 'Bosch'               , slug: 'BoschGroup'                , industry: 'other'       , size: 'enterprise' },   // verified 2026-07-06: 4669 jobs
  { name: 'Delivery Hero'       , slug: 'DeliveryHero'              , industry: 'other'       , size: 'enterprise' },   // verified 2026-07-06: 1123 jobs
  { name: 'Dominos'             , slug: 'Dominos'                   , industry: 'other'       , size: 'enterprise' },   // verified 2026-07-06: 24454 jobs
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
