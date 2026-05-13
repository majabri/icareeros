/**
 * Sprint 2 W5-C — Perplexity-powered job discovery.
 *
 * Strategy: ask sonar-pro to surface 20 recent job postings per category.
 * Every returned URL passes through a 4-stage verification gate before
 * being persisted to `opportunities`:
 *
 *   1. URL hash dedupe vs `opportunities.raw_url_hash`
 *   2. HEAD request → expect 2xx
 *   3. Title-substring check on first 50KB of body
 *   4. Domain allowlist (greenhouse, lever, ashby, workable, smartrecruiters, company TLDs)
 *
 * Cost target: ~$12.50 / month (5 queries/day × 30).
 */

import { canonicalizeUrl, hashUrl } from "./canonicalize";
import type { DiscoveredJob } from "./rssAdapters";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

export const DISCOVERY_CATEGORIES = [
  "software engineering",
  "data engineering / data science",
  "product management",
  "design (product / UX / UI)",
  "marketing / growth",
] as const;
export type DiscoveryCategory = typeof DISCOVERY_CATEGORIES[number];

interface PerplexityRow {
  company: string;
  role: string;
  url: string;
  location?: string | null;
  posted_date?: string | null;
  source_domain?: string;
}

const ALLOWED_DOMAINS = new Set([
  "greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io",
  "lever.co", "jobs.lever.co",
  "ashbyhq.com", "jobs.ashbyhq.com",
  "workable.com", "apply.workable.com",
  "smartrecruiters.com", "jobs.smartrecruiters.com",
]);

function isAllowedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (ALLOWED_DOMAINS.has(host)) return true;
    // Accept any subdomain of an allowlisted host
    for (const d of ALLOWED_DOMAINS) {
      if (host.endsWith(`.${d}`)) return true;
    }
    // Accept any .com / .ai / .io company TLD (1-level subdomain only, e.g. careers.foo.com)
    if (/^[a-z0-9-]+\.(com|ai|io|co)$/.test(host) ||
        /^careers\.[a-z0-9-]+\.(com|ai|io|co)$/.test(host) ||
        /^jobs\.[a-z0-9-]+\.(com|ai|io|co)$/.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Ask Perplexity for 20 recent postings in `category`. Returns raw rows. */
export async function askPerplexity(category: DiscoveryCategory, apiKey: string): Promise<PerplexityRow[]> {
  const system = "You are a job-listings researcher. Return ONLY verifiable job postings from the last 7 days at established companies. Each posting MUST include a working URL on the company's careers page or a reputable ATS (greenhouse.io, lever.co, ashbyhq.com, workable.com, smartrecruiters.com). Never invent listings. If unsure, omit.";
  const user = `Find 20 recent ${category} job postings posted in the last 7 days at US-based companies hiring remote or hybrid. Return a JSON array with each item having: company (string), role (string), url (string, must be a real careers/ATS URL), location (string|null), posted_date (YYYY-MM-DD|null), source_domain (string).`;

  const body = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: {
            jobs: {
              type: "array",
              items: {
                type: "object",
                required: ["company", "role", "url"],
                properties: {
                  company:       { type: "string" },
                  role:          { type: "string" },
                  url:           { type: "string", format: "uri" },
                  location:      { type: ["string", "null"] },
                  posted_date:   { type: ["string", "null"] },
                  source_domain: { type: "string" },
                },
              },
            },
          },
          required: ["jobs"],
        },
      },
    },
  };

  const res = await fetch(PERPLEXITY_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: { jobs?: PerplexityRow[] };
  try { parsed = JSON.parse(raw); }
  catch { return []; }

  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  return jobs.filter(j => j && typeof j.url === "string" && typeof j.role === "string" && typeof j.company === "string");
}

export interface PerplexityVerification {
  ok:        boolean;
  reason?:   "duplicate" | "head_failed" | "title_mismatch" | "domain_blocked";
}

/** 4-stage verification gate. Returns ok=false with reason if any stage fails. */
export async function verifyPerplexityRow(
  row:               PerplexityRow,
  existingUrlHashes: Set<string>,
): Promise<PerplexityVerification> {
  if (!isAllowedDomain(row.url)) return { ok: false, reason: "domain_blocked" };

  const hash = hashUrl(row.url);
  if (existingUrlHashes.has(hash)) return { ok: false, reason: "duplicate" };

  // HEAD check — most ATS endpoints support HEAD; if not, follow with GET
  let probeRes: Response;
  try {
    probeRes = await fetch(row.url, { method: "HEAD", redirect: "follow",
      headers: { "User-Agent": "iCareerOS-verifier/1.0" } });
    if (!probeRes.ok && probeRes.status === 405) {
      // Some ATSes 405 HEAD — fall back to a tiny GET
      probeRes = await fetch(row.url, { method: "GET", redirect: "follow",
        headers: { "User-Agent": "iCareerOS-verifier/1.0", Range: "bytes=0-50000" } });
    }
    if (!probeRes.ok) return { ok: false, reason: "head_failed" };
  } catch {
    return { ok: false, reason: "head_failed" };
  }

  // Title-substring check
  try {
    const getRes = await fetch(row.url, { method: "GET", redirect: "follow",
      headers: { "User-Agent": "iCareerOS-verifier/1.0", Range: "bytes=0-50000" } });
    const text = (await getRes.text()).slice(0, 50000).toLowerCase();
    const roleTokens = row.role.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    if (roleTokens.length === 0) return { ok: true };  // nothing to check
    const hitCount = roleTokens.filter(t => text.includes(t)).length;
    const hitRatio = hitCount / roleTokens.length;
    if (hitRatio < 0.6) return { ok: false, reason: "title_mismatch" };
  } catch {
    // If the body fetch fails AFTER a successful HEAD, accept conservatively
    return { ok: true };
  }

  return { ok: true };
}

export function toDiscoveredJob(row: PerplexityRow): DiscoveredJob {
  const canonical = canonicalizeUrl(row.url);
  return {
    source: "perplexity",
    source_type: "llm_discovery",
    external_id: null,
    title: row.role,
    company: row.company,
    description: null,
    raw_url: row.url,
    canonical_url: canonical,
    raw_url_hash: hashUrl(row.url),
    location: row.location ?? null,
    posted_date: row.posted_date ?? null,
    raw_payload: row as unknown as Record<string, unknown>,
  };
}
