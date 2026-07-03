// deno-lint-ignore-file no-explicit-any
/**
 * enrich-jobs — Phase 1 of feat/jobs-pipeline.
 *
 * Every 4h at :30 the scheduled invocation processes up to 100 jobs
 * where enrichment_status='pending':
 *   1. Resolve apply_url → direct_apply_url (follow trackers, 3 hops max)
 *   2. Validate URL (HEAD, 8s timeout) → apply_url_status + last_validated_at
 *   3. Extract skills from description (regex) → extracted_skills[]
 *   4. Infer seniority from title → extracted_seniority
 *   5. Mark enrichment_status='complete' (or 'failed' after 3 retries)
 *
 * Runs 5 workers in parallel. Never fails the entire batch on a single
 * job — errors are captured on the row (enrichment_retry_count + failed).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ── Skill inference (shared with the Next.js side; kept in-file so the
//    edge bundle has no external deps beyond @supabase/supabase-js) ──────
const SKILL_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /\bAWS\b|Amazon Web Services/i, skill: "AWS" },
  { pattern: /\bAzure\b/i,                    skill: "Azure" },
  { pattern: /\bGCP\b|Google Cloud/i,         skill: "GCP" },
  { pattern: /\bkubernetes\b|\bk8s\b/i,       skill: "Kubernetes" },
  { pattern: /\bdocker\b/i,                   skill: "Docker" },
  { pattern: /\bterraform\b/i,                skill: "Terraform" },
  { pattern: /\bCI\/CD\b|jenkins|circleci|github actions/i, skill: "CI/CD" },
  { pattern: /\bprometheus\b/i,               skill: "Prometheus" },
  { pattern: /\bgrafana\b/i,                  skill: "Grafana" },
  { pattern: /\bdatadog\b/i,                  skill: "Datadog" },
  { pattern: /\bsplunk\b/i,                   skill: "Splunk" },
  { pattern: /\bSOC\b|security operations center/i, skill: "SOC operations" },
  { pattern: /\bGRC\b|governance.*risk.*compliance/i, skill: "GRC" },
  { pattern: /\bSIEM\b/i,                     skill: "SIEM" },
  { pattern: /\bzero trust\b/i,               skill: "Zero Trust" },
  { pattern: /\bpenetration test|pentesting|red team/i, skill: "Penetration Testing" },
  { pattern: /\bincident response\b/i,        skill: "Incident Response" },
  { pattern: /\bthreat modeling\b/i,          skill: "Threat Modeling" },
  { pattern: /\bthreat intelligence\b/i,      skill: "Threat Intelligence" },
  { pattern: /\bSOC 2\b|SOX|ISO 27001|NIST|HIPAA|PCI[-\s]?DSS|GDPR|CCPA/i, skill: "Compliance Frameworks" },
  { pattern: /\bidentity.*access management|\bIAM\b/i, skill: "IAM" },
  { pattern: /\bDLP\b|data loss prevention/i, skill: "DLP" },
  { pattern: /\bEDR\b|endpoint detection/i,   skill: "EDR" },
  { pattern: /\bpython\b/i,                   skill: "Python" },
  { pattern: /\btypescript\b/i,               skill: "TypeScript" },
  { pattern: /\bjavascript\b/i,               skill: "JavaScript" },
  { pattern: /\bgo\b(?!\s*(?:home|to|forward))/i, skill: "Go" },
  { pattern: /\brust\b/i,                     skill: "Rust" },
  { pattern: /\bjava\b(?!script)/i,           skill: "Java" },
  { pattern: /\breact\b/i,                    skill: "React" },
  { pattern: /\bnode\.?js\b/i,                skill: "Node.js" },
  { pattern: /\bsql\b/i,                      skill: "SQL" },
  { pattern: /\bpostgres|postgresql\b/i,      skill: "PostgreSQL" },
  { pattern: /\bmongodb\b/i,                  skill: "MongoDB" },
  { pattern: /\bkafka\b/i,                    skill: "Kafka" },
  { pattern: /\bsnowflake\b/i,                skill: "Snowflake" },
  { pattern: /\bdatabricks\b/i,               skill: "Databricks" },
  { pattern: /\bagile\b|\bscrum\b/i,          skill: "Agile / Scrum" },
];

function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, skill } of SKILL_PATTERNS) {
    if (pattern.test(text)) found.add(skill);
  }
  return Array.from(found);
}

function inferSeniority(title: string): string {
  const t = (title ?? "").toLowerCase();
  if (/\bintern\b/.test(t))                        return "intern";
  if (/\bjunior\b|\bjr\.?\b/.test(t))              return "junior";
  if (/\bassociate\b/.test(t))                     return "associate";
  if (/\bstaff\b/.test(t))                         return "staff";
  if (/\bprincipal\b/.test(t))                     return "principal";
  if (/\bcto\b|\bceo\b|\bcio\b|\bciso\b|\bcfo\b|\bcoo\b|\bcso\b|\bcmo\b|\bcpo\b/i.test(t) ||
      /\bchief\b|\bpresident\b|\bexecutive\b/i.test(t)) return "executive";
  if (/\bbiso\b|\bbusiness information security officer\b/i.test(t)) return "director";
  if (/\bvp\b|\bvice president\b|\bsvp\b|\bevp\b/.test(t)) return "vp";
  if (/\bdirector\b|\bhead of\b/.test(t))          return "director";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t))     return "senior";
  if (/\bmanager\b/.test(t))                       return "mid";
  return "unknown";
}

// ── URL resolution — follow up to 3 redirects, HEAD with timeout ────────
const TRACKER_HOSTS = /adzuna\.com|indeed\.com\/rc\/|glassdoor\.com\/partner|ziprecruiter\.com\/j\//i;

async function followRedirects(initialUrl: string, hops = 3, timeoutMs = 8000): Promise<{ url: string; status: number }> {
  let currentUrl = initialUrl;
  let lastStatus = 0;
  for (let i = 0; i < hops; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(currentUrl, {
        method:   "HEAD",
        redirect: "manual",
        signal:   controller.signal,
        headers:  { "User-Agent": "Mozilla/5.0 iCareerOS-Enricher/1.0" },
      });
      clearTimeout(timeout);
      lastStatus = res.status;
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return { url: currentUrl, status: lastStatus };
        currentUrl = new URL(next, currentUrl).href;
        continue;
      }
      return { url: currentUrl, status: lastStatus };
    } catch (_e) {
      return { url: currentUrl, status: lastStatus };
    }
  }
  return { url: currentUrl, status: lastStatus };
}

async function resolveApplyUrl(applyUrl: string): Promise<{ resolved: string; status: number }> {
  if (!applyUrl) return { resolved: "", status: 0 };
  if (!TRACKER_HOSTS.test(applyUrl)) {
    // Not a known tracker — still validate the URL is reachable.
    const { status } = await followRedirects(applyUrl, 1);
    return { resolved: applyUrl, status };
  }
  const r = await followRedirects(applyUrl, 3);
  const resolved = TRACKER_HOSTS.test(r.url) ? applyUrl : r.url;
  return { resolved, status: r.status };
}

// ── Batch orchestration ─────────────────────────────────────────────────
const BATCH_SIZE   = 100;
const WORKER_COUNT = 5;
const MAX_RETRIES  = 3;

interface JobRow {
  id: string;
  title: string | null;
  description: string | null;
  apply_url: string | null;
  enrichment_retry_count: number | null;
}

async function processJob(supabase: any, job: JobRow): Promise<void> {
  const description = job.description ?? "";
  const skills      = extractSkills(description);
  const seniority   = inferSeniority(job.title ?? "");

  let directUrl: string | null = null;
  let status = 0;
  if (job.apply_url) {
    try {
      const r = await resolveApplyUrl(job.apply_url);
      directUrl = r.resolved;
      status    = r.status;
    } catch (_e) { /* leave direct_url null */ }
  }

  const ok = !job.apply_url || (status >= 200 && status < 400);
  const patch: any = {
    extracted_skills:     skills,
    extracted_seniority:  seniority,
    direct_apply_url:     directUrl,
    apply_url_status:     status || null,
    last_validated_at:    new Date().toISOString(),
    enriched_at:          new Date().toISOString(),
  };
  if (ok) {
    patch.enrichment_status = "complete";
  } else {
    const nextRetry = (job.enrichment_retry_count ?? 0) + 1;
    patch.enrichment_retry_count = nextRetry;
    patch.enrichment_status      = nextRetry >= MAX_RETRIES ? "failed" : "pending";
  }
  await supabase.from("ats_jobs").update(patch).eq("id", job.id);
}

async function runBatch(supabase: any): Promise<{ processed: number; failed: number; ok: number }> {
  const { data, error } = await supabase
    .from("ats_jobs")
    .select("id, title, description, apply_url, enrichment_retry_count")
    .eq("enrichment_status", "pending")
    .eq("is_active", true)
    .lt("enrichment_retry_count", MAX_RETRIES)
    .limit(BATCH_SIZE);
  if (error) throw error;
  const jobs: JobRow[] = (data ?? []) as JobRow[];
  let ok = 0, failed = 0;

  // 5 parallel workers, each pulling from the shared queue
  const queue = [...jobs];
  await Promise.all(Array.from({ length: WORKER_COUNT }).map(async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      try {
        await processJob(supabase, job);
        ok++;
      } catch (_e) {
        failed++;
      }
    }
  }));

  return { processed: jobs.length, ok, failed };
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  try {
    const started = Date.now();
    const result  = await runBatch(supabase);
    const durationMs = Date.now() - started;
    return new Response(JSON.stringify({ ...result, durationMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[enrich-jobs] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
