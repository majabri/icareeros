/**
 * POST /api/career-os/coach-brief
 *
 * On-demand coaching brief — a concise (<300-word) reflective summary of
 * where the user is in their career cycle, top-3 next actions, one honest
 * blocker, and an encouraging close. Distinct from /api/career-os/coach
 * (which produces structured interview-prep + resume insights via Sonnet).
 *
 * Phase 1 Item 2 — see docs/specs/COWORK-BRIEF-phase1-v1.md.
 *
 * Architecture
 * ------------
 * - Model: Claude Haiku 4.5 (fast, cheap; brief is short prose, not JSON)
 * - Cache: career_os_stages.notes for the active cycle's "coach" stage row,
 *          under a "brief" key. Cache invalidates when (a) the cycle's
 *          current_stage has changed, OR (b) the evaluate stage's
 *          last_event_at moved forward, OR (c) the user's applications
 *          count grew. Otherwise the same brief is returned without a
 *          new LLM call.
 * - Rate limit: counted from `briefHistory[]` inside the same notes blob
 *               (an array of {generatedAt, plan} entries). No new schema —
 *               career_os_event_log is a VIEW with no event_type column,
 *               so we stay inside `notes` to honour the brief's "no
 *               schema change" preference. Limits: free=2/mo, premium=5/mo,
 *               professional=unlimited.
 * - Email: premium + professional plans get a transactional email via
 *          /api/email/send (Bluehost SMTP). Free tier gets in-app only.
 * - Tracing: createTracedClient(...) for Langfuse (mandatory per brief).
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { PLAN_LIMITS, type SubscriptionPlan } from "@/services/billing/types";

// ── Supabase server client ──────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch { /* ignore in server component */ }
        },
      },
    },
  );
}

// ── Plan resolution + rate limit ────────────────────────────────────────────

async function resolveEffectivePlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<SubscriptionPlan> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  const rawPlan = data?.plan;
  const plan: SubscriptionPlan =
    rawPlan && ["free", "premium", "professional"].includes(rawPlan)
      ? (rawPlan as SubscriptionPlan)
      : "free";
  const activeStatuses = ["active", "trialing"];
  return data?.status && activeStatuses.includes(data.status) ? plan : "free";
}

interface BriefHistoryEntry {
  generatedAt: string;
  plan:        SubscriptionPlan;
}

function countRecent(history: BriefHistoryEntry[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return history.filter(h => Date.parse(h.generatedAt) > cutoff).length;
}

// ── Master switch (mirror of checkPlanLimit's "monetization off → fail open") ─

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isMonetizationOn(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("flag_name", "monetization_enabled")
    .maybeSingle();
  return Boolean(data?.enabled);
}

// ── System prompt — verbatim from the brief ─────────────────────────────────

const COACH_BRIEF_SYSTEM = `You are an iCareerOS career coach writing a concise coaching brief.
Read the user's career cycle data and write a brief with:
1. Where they are now (current stage, what is complete vs pending)
2. Top 3 recommended next actions
3. One honest blocker if any stage is incomplete
4. One encouraging closing line

Keep it under 300 words. Be direct and specific, not generic.
Address the user as "you". Do not mention iCareerOS by name.`;

// ── Cache invalidation signals ──────────────────────────────────────────────

interface CacheSignals {
  currentStage:        string;
  evaluateLastEventAt: string | null;
  applicationsCount:   number;
}

interface CachedBrief {
  content:     string;
  generatedAt: string;
  signals:     CacheSignals;
}

function signalsMatch(a: CacheSignals, b: CacheSignals): boolean {
  return (
    a.currentStage === b.currentStage &&
    a.evaluateLastEventAt === b.evaluateLastEventAt &&
    a.applicationsCount === b.applicationsCount
  );
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();

    // 1. Auth
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Body
    const body = (await req.json().catch(() => ({}))) as { cycle_id?: string };
    const cycleId = body?.cycle_id;
    if (!cycleId) {
      return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
    }

    // 3. Plan + rate limit
    const plan         = await resolveEffectivePlan(supabase, user.id);
    const monthlyLimit = PLAN_LIMITS[plan].coachBriefsPerMonth;
    const monetizationOn = await isMonetizationOn(supabase);

    // 4. Load coach stage row (caches the brief + history in notes)
    const { data: coachRow, error: coachRowErr } = await supabase
      .from("career_os_stages")
      .select("id, notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .eq("stage", "coach")
      .maybeSingle();
    if (coachRowErr || !coachRow) {
      return NextResponse.json({ error: "Coach stage row not found for cycle" }, { status: 404 });
    }

    const notes = (coachRow.notes ?? {}) as {
      brief?:         CachedBrief;
      briefHistory?:  BriefHistoryEntry[];
      [k: string]:    unknown;
    };
    const history: BriefHistoryEntry[] = Array.isArray(notes.briefHistory) ? notes.briefHistory : [];

    if (monetizationOn && monthlyLimit >= 0) {
      const used = countRecent(history, 30 * 24 * 60 * 60 * 1000);
      if (used >= monthlyLimit) {
        const oldest    = [...history].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))[0];
        const resetsAt  = oldest ? new Date(Date.parse(oldest.generatedAt) + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
        return NextResponse.json(
          { error: "rate_limited", limit: monthlyLimit, used, resetsAt, plan },
          { status: 429 },
        );
      }
    }

    // 5. Compute current cache signals
    const [{ data: cycleRow }, { data: evaluateRow }, { count: applicationsCount }] = await Promise.all([
      supabase.from("career_os_cycles")
        .select("current_stage")
        .eq("id", cycleId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("career_os_stages")
        .select("last_event_at")
        .eq("user_id", user.id)
        .eq("cycle_id", cycleId)
        .eq("stage", "evaluate")
        .maybeSingle(),
      supabase.from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    if (!cycleRow) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    }

    const signals: CacheSignals = {
      currentStage:        cycleRow.current_stage ?? "evaluate",
      evaluateLastEventAt: evaluateRow?.last_event_at ?? null,
      applicationsCount:   applicationsCount ?? 0,
    };

    // 6. Cache hit?
    if (notes.brief && signalsMatch(notes.brief.signals, signals)) {
      return NextResponse.json({
        brief:       notes.brief.content,
        generatedAt: notes.brief.generatedAt,
        source:      "cache",
        plan,
      });
    }

    // 7. Build user message — pull career profile + stage state for context
    const [{ data: profile }, { data: stageRows }] = await Promise.all([
      supabase.from("career_profiles")
        .select("full_name, headline, summary, skills")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("career_os_stages")
        .select("stage, status, notes")
        .eq("user_id", user.id)
        .eq("cycle_id", cycleId),
    ]);

    const stagesSummary = (stageRows ?? []).map((r: { stage: string; status: string; notes: Record<string, unknown> | null }) => {
      const noteCount = r.notes && typeof r.notes === "object"
        ? Object.keys(r.notes as Record<string, unknown>).length : 0;
      return `  - ${r.stage}: ${r.status}${noteCount > 0 ? " (has notes)" : " (no notes)"}`;
    }).join("\n");

    const userMessage = [
      "Career profile",
      `  Name:     ${profile?.full_name ?? "(unknown)"}`,
      `  Headline: ${profile?.headline ?? "(none)"}`,
      `  Summary:  ${profile?.summary ?? "(none)"}`,
      `  Skills:   ${(profile?.skills ?? []).slice(0, 12).join(", ") || "(none)"}`,
      "",
      "Current cycle",
      `  Current stage:  ${signals.currentStage}`,
      `  Applications:   ${signals.applicationsCount}`,
      "  Stage progress:",
      stagesSummary || "  (no stages)",
      "",
      "Write the coaching brief.",
    ].join("\n");

    // 8. Call Haiku 4.5
    const anthropic = createTracedClient(user.id, "career-os/coach-brief");
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      system: COACH_BRIEF_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }
    const briefText = raw.text.trim();

    // 9. Persist — overwrite cached brief + append to history
    const generatedAt = new Date().toISOString();
    const newCached: CachedBrief = { content: briefText, generatedAt, signals };
    const newHistory = [...history, { generatedAt, plan }];
    const newNotes   = { ...notes, brief: newCached, briefHistory: newHistory };

    await supabase
      .from("career_os_stages")
      .update({ notes: newNotes, last_event_at: generatedAt })
      .eq("id", coachRow.id);

    // 10. Email premium + professional users (best-effort, not gating)
    if (plan === "premium" || plan === "professional") {
      const userEmail = user.email;
      if (userEmail) {
        const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://icareeros.com";
        void fetch(new URL("/api/email/send", origin), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie":       req.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({
            to:      userEmail,
            subject: "Your iCareerOS coaching brief is ready",
            html:    `<p>Your coaching brief is ready.</p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(briefText)}</pre><p><a href="${origin}/dashboard">Open the dashboard</a></p>`,
            text:    briefText + `\n\nOpen the dashboard: ${origin}/dashboard`,
          }),
        }).catch((e) => console.warn("[coach-brief] email send failed (non-fatal):", e));
      }
    }

    return NextResponse.json({
      brief:       briefText,
      generatedAt,
      source:      "fresh",
      plan,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[coach-brief] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
