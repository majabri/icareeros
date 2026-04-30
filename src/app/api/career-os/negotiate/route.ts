/**
 * POST /api/career-os/negotiate
 *
 * Loads a job offer from job_offers table and generates a negotiation strategy
 * using Claude Sonnet.
 *
 * Body: { offer_id: string; target_salary?: number; priorities?: string[] }
 * Response: NegotiationResult
 *
 * ANTHROPIC_API_KEY is server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { checkPlanLimit } from "@/lib/billing/checkPlanLimit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NegotiationResult {
  strategy: string;
  talkingPoints: string[];
  counterOfferRange: { low: number; high: number } | null;
  emailTemplate: string;
  riskLevel: "low" | "medium" | "high";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

const SYSTEM_PROMPT = `You are a world-class compensation negotiation coach with experience across tech, finance, consulting, and healthcare. You help candidates negotiate offers confidently and professionally.

Return ONLY valid JSON (no markdown) matching this exact schema:
{
  "strategy": "2-3 sentence overall negotiation strategy",
  "talkingPoints": ["Point 1", "Point 2", ...up to 6 specific talking points"],
  "counterOfferRange": { "low": number, "high": number } or null if salary not applicable,
  "emailTemplate": "A complete, professional negotiation email template ready to send (with [placeholders] where appropriate)",
  "riskLevel": "low" | "medium" | "high"
}

Rules:
- counterOfferRange should be realistic: 10-20% above base salary if reasonable
- emailTemplate should be polished, confident but not aggressive, ready to customize
- talkingPoints should be specific and actionable, not generic advice
- riskLevel reflects risk of losing the offer if they negotiate
- Keep all fields concise and practical`;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await makeSupabaseServer();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Plan limit check ──────────────────────────────────────────────────────
    const limitBlock = await checkPlanLimit(supabase, user.id, "aiCoach");
    if (limitBlock) return limitBlock;

    // 2. Parse body
    const body = (await req.json().catch(() => ({}))) as {
      offer_id?: string;
      target_salary?: number;
      priorities?: string[];
    };

    if (!body.offer_id) {
      return NextResponse.json({ error: "offer_id is required" }, { status: 400 });
    }

    // 3. Load offer from DB (RLS ensures ownership)
    const { data: offer, error: offerErr } = await supabase
      .from("job_offers")
      .select("*")
      .eq("id", body.offer_id)
      .single();

    if (offerErr || !offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // 4. Build context
    const salaryCtx = offer.base_salary
      ? `Base salary: $${Number(offer.base_salary).toLocaleString()}`
      : "Base salary: not specified";

    const totalCtx = offer.total_comp
      ? `Total comp: $${Number(offer.total_comp).toLocaleString()}`
      : "";

    const targetCtx = body.target_salary
      ? `Target salary: $${body.target_salary.toLocaleString()}`
      : "";

    const prioritiesCtx =
      body.priorities && body.priorities.length > 0
        ? `Negotiation priorities: ${body.priorities.join(", ")}`
        : "";

    const offerContext = [
      `Company: ${offer.company}`,
      `Role: ${offer.role_title}`,
      salaryCtx,
      totalCtx,
      offer.equity ? `Equity: ${offer.equity}` : "",
      offer.bonus ? `Bonus: ${offer.bonus}` : "",
      offer.benefits ? `Benefits: ${offer.benefits}` : "",
      offer.deadline ? `Deadline: ${offer.deadline}` : "",
      targetCtx,
      prioritiesCtx,
      offer.notes ? `Additional context: ${offer.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // 5. Call Claude Sonnet
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a negotiation strategy for this job offer:\n\n${offerContext}`,
        },
      ],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonStr = raw.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let result: NegotiationResult;
    try {
      result = JSON.parse(jsonStr) as NegotiationResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate
    if (!result.strategy || !Array.isArray(result.talkingPoints)) {
      throw new Error("Missing required fields in Claude response");
    }

    // 6. Persist result to offer row (best-effort)
    void supabase
      .from("job_offers")
      .update({ negotiation_result: result, status: "negotiating" })
      .eq("id", body.offer_id);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[negotiate] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
