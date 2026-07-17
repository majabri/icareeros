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

// (removed jsr:@supabase/functions-js edge-runtime type import — pulls a transitive npm:openai
//  dep that deno check cannot resolve without a node_modules folder. Deno.serve is provided
//  ambient in the edge runtime.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // fix/jobs-jd-extractor — Deno-side mirror of the Node change.
  //   * "Managing Director" and "Executive Director" are exec-tier.
  //   * BISO / "*-Officer" titles land at executive (was director; RBC
  //     acceptance test proved that mis-classifies).
  //   * "distinguished", "fellow" → principal.
  if (/\bmanaging\s+director\b|\bexecutive\s+director\b/i.test(t)) return "executive";
  if (/\bintern\b/.test(t))                        return "intern";
  if (/\bjunior\b|\bjr\.?\b/.test(t))              return "junior";
  if (/\bassociate\b/.test(t))                     return "associate";
  if (/\bstaff\b/.test(t))                         return "staff";
  if (/\bdistinguished\b|\bfellow\b/.test(t))     return "principal";
  if (/\bprincipal\b/.test(t))                     return "principal";
  if (/\bcto\b|\bceo\b|\bcio\b|\bciso\b|\bcfo\b|\bcoo\b|\bcso\b|\bcmo\b|\bcpo\b/i.test(t) ||
      /\bchief\b|\bpresident\b|\bexecutive\b/i.test(t)) return "executive";
  if (/\bbiso\b|\bbusiness\s+information\s+security\s+officer\b/i.test(t)) return "executive";
  if (/\b(?:security|compliance|information|data|privacy|technology|risk)\s+officer\b/i.test(t)) return "executive";
  if (/\bvp\b|\bvice\s+president\b|\bsvp\b|\bevp\b/.test(t)) return "vp";
  if (/\bdirector\b|\bhead\s+of\b/.test(t))       return "director";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t))    return "senior";
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

// ── Role-family classification ─────────────────────────────────────────
//   fix/jobs-enrichment-silent-complete — the enricher previously wrote
//   extracted_skills + extracted_seniority + direct_apply_url + status
//   but NEVER touched role_families or seniority_tier. Downstream curator
//   queries filter by role_families overlap, so 48,891 of 49,685 "complete"
//   rows (98.4%) were invisible to family-based retrieval.
//
//   Fix: word-bounded title match against the same ROLE_FAMILIES taxonomy
//   the curator uses (mirror of curate-user-recommendations/lib.ts —
//   Deno edge functions do not share code across function directories).
//   Rows that match any family get role_families populated. Rows that
//   match nothing keep role_families=[] but the "complete" status is
//   honest: the classifier tried and found nothing (as opposed to
//   never having tried, which was the pre-fix reality).

const ROLE_FAMILIES: Record<string, string[]> = {
  director_of_security: [
    "director of security", "director security", "head of security",
    "head of information security", "director information security",
    "security director", "director cyber security", "director of infosec",
    "director of cybersecurity", "security program director",
    "senior director security", "senior director of security",
    "security lead", "lead security", "principal security",
    "senior security manager", "sr security manager",
    "information security lead", "security operations director",
    "director of information security", "information security director",
    "security operations lead",
  ],
  ciso: [
    "ciso", "chief information security officer", "chief security officer",
    "chief information security", "chief cybersecurity officer",
    "cso", "global ciso", "deputy ciso",
    "ciso office", "ciso deputy", "associate ciso",
    "field ciso", "virtual ciso", "vciso",
    "security executive", "executive security", "security chief",
  ],
  biso: [
    "biso", "business information security officer",
    "business information security", "business security officer",
    "divisional ciso", "business unit ciso",
  ],
  security_architect: [
    "security architect", "principal security architect",
    "lead security architect", "senior security architect",
    "chief security architect", "staff security architect",
    "enterprise security architect", "cybersecurity architect",
    "solutions architect security", "security solutions architect",
    "principal solutions architect security",
  ],
  vp_security: [
    "vp security", "vice president security", "vp information security",
    "vp cybersecurity", "vice president of security",
    "vice president cybersecurity", "vp cyber",
  ],
  director_of_engineering: [
    "director of engineering", "engineering director", "head of engineering",
    "director software engineering", "director platform engineering",
    "senior director engineering", "director r&d",
  ],
  vp_engineering: [
    "vp engineering", "vice president engineering", "vp software engineering",
    "svp engineering", "evp engineering",
  ],
  cto: [
    "cto", "chief technology officer", "chief technical officer",
    "chief technical", "chief tech officer",
  ],
  staff_engineer: [
    "staff engineer", "staff software engineer", "staff sre",
    "principal engineer", "principal software engineer",
    "distinguished engineer",
  ],
  senior_engineer: [
    "senior engineer", "senior software engineer", "sr. software engineer",
    "senior swe", "senior developer", "senior full-stack engineer",
  ],
  director_of_product: [
    "director of product", "product director", "head of product",
    "director product management", "senior director product",
  ],
  vp_product: [
    "vp product", "vice president product", "svp product",
    "chief product officer", "cpo",
  ],
  senior_pm: [
    "senior product manager", "sr. product manager", "senior pm", "lead product manager",
  ],
  director_of_data: [
    "director of data", "data director", "head of data", "head of analytics",
    "director data science", "director analytics",
  ],
  cdo: [
    "chief data officer", "cdo", "chief data", "chief analytics officer",
  ],
  data_scientist: [
    "data scientist", "senior data scientist", "principal data scientist",
    "ml engineer", "machine learning engineer",
  ],
  director_of_design: [
    "director of design", "design director", "head of design",
    "director product design", "director ux",
  ],
  vp_design: [
    "vp design", "vice president design", "chief design officer",
  ],
  vp_sales: [
    "vp sales", "vice president sales", "svp sales", "head of sales",
    "chief revenue officer", "cro",
  ],
  director_of_sales: [
    "director of sales", "sales director", "director enterprise sales",
    "director of business development",
  ],
  ae: [
    "account executive", "senior account executive", "enterprise account executive", "ae",
  ],
  cmo: [
    "chief marketing officer", "cmo", "vp marketing", "svp marketing",
    "head of marketing",
  ],
  director_of_marketing: [
    "director of marketing", "marketing director", "director growth",
    "director demand generation", "director performance marketing",
  ],
  chro: [
    "chro", "chief people officer", "chief human resources officer",
    "cpeo", "vp people", "vp hr", "vp human resources",
  ],
  director_of_people: [
    "director of people", "people director", "head of people",
    "director talent", "director of talent",
  ],
  cfo: [
    "cfo", "chief financial officer", "vp finance", "svp finance",
  ],
  controller: [
    "controller", "financial controller", "corporate controller", "assistant controller",
  ],
  coo: [
    "coo", "chief operating officer", "chief operations officer",
    "vp operations", "svp operations",
  ],
  director_of_operations: [
    "director of operations", "operations director", "head of operations",
    "director business operations",
  ],
  general_counsel: [
    "general counsel", "chief legal officer", "clo", "vp legal",
    "head of legal",
  ],
  vp_customer_success: [
    "vp customer success", "vice president customer success",
    "head of customer success", "chief customer officer", "cco",
  ],
  director_of_customer_success: [
    "director of customer success", "customer success director",
    "head of cs",
  ],
};

function normalisePhrase(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[,;:—–\-\/&()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify a job title into 0..N role families. Word-bounded phrase match:
 * a family hits when any of its synonym phrases appears as a contiguous
 * token subsequence inside the normalised title.
 */
function classifyRoleFamilies(title: string): string[] {
  if (!title) return [];
  const norm = normalisePhrase(title);
  const tokens = norm.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const hits = new Set<string>();
  for (const [family, synonyms] of Object.entries(ROLE_FAMILIES)) {
    for (const syn of synonyms) {
      const sTokens = normalisePhrase(syn).split(" ").filter(Boolean);
      if (sTokens.length === 0 || sTokens.length > tokens.length) continue;
      // Sliding window match
      for (let i = 0; i + sTokens.length <= tokens.length; i++) {
        let match = true;
        for (let j = 0; j < sTokens.length; j++) {
          if (tokens[i + j] !== sTokens[j]) { match = false; break; }
        }
        if (match) { hits.add(family); break; }
      }
      if (hits.has(family)) break;
    }
  }
  return Array.from(hits);
}

// ── Batch orchestration ─────────────────────────────────────────────────
const BATCH_SIZE       = 250;   // Fix 1 — raised from 100
const WORKER_COUNT     = 5;
const MAX_RETRIES      = 3;
const MAX_CHAIN_DEPTH  = 40;    // Fix 1 — hard stop on self-invoke chain

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
  // fix/jobs-enrichment-silent-complete — populate role_families +
  //   seniority_tier. Before this fix these columns were never written
  //   by the enricher; downstream curator queries that filter by
  //   role_families overlap missed 98% of rows.
  const roleFamilies = classifyRoleFamilies(job.title ?? "");
  const patch: any = {
    extracted_skills:     skills,
    extracted_seniority:  seniority,
    role_families:        roleFamilies,
    seniority_tier:       seniority === "unknown" ? null : seniority,
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

async function runBatch(
  supabase: any,
  opts: { priorityTitleFilter?: string } = {},
): Promise<{ processed: number; failed: number; ok: number; remainingPending: number }> {
  // Fix 2 — priority lane. When priorityTitleFilter is set, we first try
  // to pull rows whose title matches the regex; if that returns < BATCH_SIZE,
  // fill with regular pending rows so we never starve the general queue.
  let priorityRows: JobRow[] = [];
  if (opts.priorityTitleFilter && opts.priorityTitleFilter.length > 0) {
    // Postgres regex_matches via .ilike-style OR — pg does not accept a
    // full regex in supabase-js filters directly, so we split the filter
    // into OR-joined ilike patterns. Callers pass a "|"-delimited word
    // list like "security|ciso|director|chief|vp|head of".
    const orFilter = opts.priorityTitleFilter
      .split("|")
      .map(k => k.trim())
      .filter(Boolean)
      .map(k => `title.ilike.%${k}%`)
      .join(",");
    if (orFilter) {
      const { data } = await supabase
        .from("ats_jobs")
        .select("id, title, description, apply_url, enrichment_retry_count")
        .eq("enrichment_status", "pending")
        .eq("is_active", true)
        .lt("enrichment_retry_count", MAX_RETRIES)
        .or(orFilter)
        .limit(BATCH_SIZE);
      priorityRows = (data ?? []) as JobRow[];
    }
  }

  let regularRows: JobRow[] = [];
  const remaining = BATCH_SIZE - priorityRows.length;
  if (remaining > 0) {
    // Exclude the priority row ids to avoid double-processing
    let q = supabase
      .from("ats_jobs")
      .select("id, title, description, apply_url, enrichment_retry_count")
      .eq("enrichment_status", "pending")
      .eq("is_active", true)
      .lt("enrichment_retry_count", MAX_RETRIES)
      .limit(remaining);
    if (priorityRows.length > 0) {
      const ids = priorityRows.map(r => r.id).filter(Boolean);
      if (ids.length > 0) q = q.not("id", "in", `(${ids.join(",")})`);
    }
    const { data, error } = await q;
    if (error) throw error;
    regularRows = (data ?? []) as JobRow[];
  }

  const jobs = [...priorityRows, ...regularRows];
  let ok = 0, failed = 0;
  const queue = [...jobs];
  await Promise.all(Array.from({ length: WORKER_COUNT }).map(async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      try { await processJob(supabase, job); ok++; }
      catch (_e) { failed++; }
    }
  }));

  // Fix 1 — remainingPending for observability + chain gating
  const { count: remainingCount } = await supabase
    .from("ats_jobs")
    .select("id", { count: "estimated", head: true })
    .eq("enrichment_status", "pending")
    .eq("is_active", true)
    .lt("enrichment_retry_count", MAX_RETRIES);

  return { processed: jobs.length, ok, failed, remainingPending: remainingCount ?? 0 };
}

async function selfInvokeIfPending(chainDepth: number, priorityTitleFilter?: string): Promise<void> {
  // Fix 1 — fire-and-forget self-invocation to drain the queue in one
  // 4h cron tick. Cap at MAX_CHAIN_DEPTH so a bug can't create an
  // infinite chain (40 × 250 rows = 10,000 rows per cron tick).
  if (chainDepth >= MAX_CHAIN_DEPTH) return;
  try {
    void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainDepth: chainDepth + 1, priorityTitleFilter }),
    }).catch(() => {});
  } catch { /* silent — never let self-invoke failure surface */ }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // Fix 1 + Fix 2 — read chainDepth + priorityTitleFilter from body
  let chainDepth = 0;
  let priorityTitleFilter: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.chainDepth === "number") chainDepth = Math.max(0, body.chainDepth);
    if (typeof body?.priorityTitleFilter === "string") priorityTitleFilter = body.priorityTitleFilter;
  } catch { /* no body / not JSON — treat as first tick */ }

  try {
    const started = Date.now();
    const result  = await runBatch(supabase, { priorityTitleFilter });
    const durationMs = Date.now() - started;

    // Fix 1 — self-invoke if pending remains, unless we hit the depth cap.
    if (result.remainingPending > 0 && result.processed > 0) {
      await selfInvokeIfPending(chainDepth, priorityTitleFilter);
    }

    return new Response(JSON.stringify({
      ...result,
      chainDepth,
      durationMs,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[enrich-jobs] fatal:", err);
    return new Response(JSON.stringify({ error: String(err), chainDepth }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
