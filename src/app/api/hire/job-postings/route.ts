/**
 * /api/hire/job-postings — CRUD for employer job postings.
 *
 * Sprint H2 — backs Stage 01 Design's JD form. RLS on `job_postings`
 * already enforces `user_id = auth.uid()` for INSERT/UPDATE/DELETE
 * (per ADR-HIRE-002 v1.1 migration); this route adds the rate-limit
 * backstop and an employer-friendly error surface.
 *
 * Endpoints:
 *   POST   — create a draft (status='draft')
 *   PATCH  — update content / change status (draft→open fires the
 *            opportunities-mirror trigger automatically)
 *   GET    — list the authenticated employer's own postings
 *
 * Gates:
 *   401 — unauthenticated
 *   400 — missing/invalid body
 *   404 — PATCH target not owned by caller (RLS hides it; we treat
 *         "0 rows updated" as 404 for cleaner errors)
 *   429 — rate limit (100 posts/employer/day, rolling 24h) — emits
 *         Retry-After: 86400. Abuse backstop only; not surfaced in
 *         product copy.
 *
 * Cross-side note: when a row flips to status='open', the
 * opportunities-mirror trigger (PR #293) creates/updates the matching
 * `opportunities.job_posting_id` row so jobs.icareeros.com/jobs picks
 * it up. This route does NOT call the mirror — the trigger handles it.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";

// ── Supabase server client (cookie-based session) ───────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCrossSubdomainCookie(options)),
            );
          } catch { /* server component context */ }
        },
      },
    },
  );
}

// ── Validation helpers ──────────────────────────────────────────────────────

const VALID_STATUSES = ["draft", "open", "closed", "filled"] as const;
type Status = typeof VALID_STATUSES[number];

const VALID_JOB_TYPES = ["full-time", "part-time", "contract", "internship"] as const;

interface JobPostingCreate {
  title:          string;
  company:        string;
  description:    string;
  department?:    string | null;
  location?:      string | null;
  job_type?:      string | null;
  is_remote?:     boolean;
  salary_min?:    number | null;
  salary_max?:    number | null;
  requirements?:  string | null;
  nice_to_haves?: string | null;
}

interface JobPostingPatch extends Partial<JobPostingCreate> {
  id:      string;
  status?: Status;
}

function isPlainString(x: unknown, max = 5000): x is string {
  return typeof x === "string" && x.length > 0 && x.length <= max;
}

function sanitizeNullableString(x: unknown, max = 5000): string | null | undefined {
  if (x === undefined) return undefined;
  if (x === null || x === "") return null;
  if (typeof x !== "string") return undefined;
  return x.length > max ? x.slice(0, max) : x;
}

function sanitizeSalary(x: unknown): number | null | undefined {
  if (x === undefined) return undefined;
  if (x === null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// ── Rate limit — 100 posts/employer/day, rolling 24h ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isOverDailyLimit(supabase: any, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("job_postings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    // On a count failure, fail-open (better to allow the post than to
    // 500 the employer; the table-level constraints still protect us).
    return false;
  }
  return (count ?? 0) >= 100;
}

// ── POST — create draft ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (await isOverDailyLimit(supabase, user.id)) {
    return new NextResponse(
      JSON.stringify({ error: "Daily post limit reached. Try again tomorrow." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After":  "86400",
        },
      },
    );
  }

  let body: Partial<JobPostingCreate>;
  try {
    body = (await req.json()) as Partial<JobPostingCreate>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required fields.
  if (!isPlainString(body.title, 200))
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!isPlainString(body.company, 200))
    return NextResponse.json({ error: "company is required" }, { status: 400 });
  if (!isPlainString(body.description, 5000))
    return NextResponse.json({ error: "description is required" }, { status: 400 });

  const payload: Record<string, unknown> = {
    user_id:       user.id,
    status:        "draft",
    title:         body.title.trim(),
    company:       body.company.trim(),
    description:   body.description.trim(),
    department:    sanitizeNullableString(body.department, 200) ?? null,
    location:      sanitizeNullableString(body.location, 200) ?? null,
    job_type:      VALID_JOB_TYPES.includes(body.job_type as typeof VALID_JOB_TYPES[number])
                     ? body.job_type
                     : "full-time",
    is_remote:     Boolean(body.is_remote),
    requirements:  sanitizeNullableString(body.requirements, 5000) ?? null,
    nice_to_haves: sanitizeNullableString(body.nice_to_haves, 5000) ?? null,
    salary_min:    sanitizeSalary(body.salary_min) ?? null,
    salary_max:    sanitizeSalary(body.salary_max) ?? null,
  };

  const { data, error } = await supabase
    .from("job_postings")
    .insert(payload)
    .select("id, status, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create posting" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: data.id, status: data.status, created_at: data.created_at },
    { status: 201 },
  );
}

// ── PATCH — update / publish / close ────────────────────────────────────────

export async function PATCH(req: Request) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: Partial<JobPostingPatch>;
  try {
    body = (await req.json()) as Partial<JobPostingPatch>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Build the patch — only include fields the caller provided.
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined)      patch.status        = body.status;
  if (body.title !== undefined)       patch.title         = String(body.title).slice(0, 200).trim();
  if (body.company !== undefined)     patch.company       = String(body.company).slice(0, 200).trim();
  if (body.description !== undefined) patch.description   = String(body.description).slice(0, 5000).trim();
  if (body.department !== undefined)  patch.department    = sanitizeNullableString(body.department, 200);
  if (body.location !== undefined)    patch.location      = sanitizeNullableString(body.location, 200);
  if (body.requirements !== undefined) patch.requirements = sanitizeNullableString(body.requirements, 5000);
  if (body.nice_to_haves !== undefined) patch.nice_to_haves = sanitizeNullableString(body.nice_to_haves, 5000);
  if (body.salary_min !== undefined)  patch.salary_min    = sanitizeSalary(body.salary_min);
  if (body.salary_max !== undefined)  patch.salary_max    = sanitizeSalary(body.salary_max);
  if (body.is_remote !== undefined)   patch.is_remote     = Boolean(body.is_remote);
  if (body.job_type !== undefined &&
      VALID_JOB_TYPES.includes(body.job_type as typeof VALID_JOB_TYPES[number])) {
    patch.job_type = body.job_type;
  }

  // Stamp published_at when the row transitions to 'open' for the first time.
  // The trigger handles the opportunities mirror; we just record the time.
  if (body.status === "open") {
    patch.published_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("job_postings")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", user.id)         // belt + suspenders alongside RLS
    .select("id, status, published_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // Either the row doesn't exist or RLS blocked the update — same UX.
    return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// ── GET — list employer's own postings ──────────────────────────────────────

export async function GET() {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("job_postings")
    .select("id, title, company, status, published_at, created_at, updated_at, is_remote, location")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ postings: data ?? [] });
}
