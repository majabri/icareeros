import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SalaryRange {
  min: number;        // annual USD
  max: number;        // annual USD
  currency: string;   // ISO code, e.g. "USD"
  label: string;      // formatted, e.g. "~$120k – $150k"
  confidence: "high" | "medium" | "low";
}

interface OpportunityRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  job_type: string | null;
  is_remote: boolean | null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let opportunityIds: string[];
  try {
    const body = await req.json();
    if (!Array.isArray(body.opportunity_ids) || body.opportunity_ids.length === 0) {
      return NextResponse.json(
        { error: "opportunity_ids must be a non-empty array" },
        { status: 400 }
      );
    }
    // Cap at 30 per batch
    opportunityIds = (body.opportunity_ids as string[]).slice(0, 30);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Fetch opportunity details ───────────────────────────────────────────────
  const { data: opps, error: oppsErr } = await supabase
    .from("opportunities")
    .select("id,title,company,location,job_type,is_remote")
    .in("id", opportunityIds);

  if (oppsErr) {
    return NextResponse.json({ error: oppsErr.message }, { status: 500 });
  }
  if (!opps || opps.length === 0) {
    return NextResponse.json({ ranges: {} });
  }

  // ── Build prompt ────────────────────────────────────────────────────────────
  const opportunitiesText = (opps as OpportunityRow[])
    .map((opp, i) =>
      [
        `OPPORTUNITY ${i + 1} (id: ${opp.id})`,
        `Title: ${opp.title}`,
        `Company: ${opp.company}`,
        `Location: ${opp.location ?? "Not specified"} | Remote: ${opp.is_remote ? "yes" : "no"}`,
        `Type: ${opp.job_type ?? "Full-time"}`,
      ].join("\n")
    )
    .join("\n\n");

  const systemPrompt = `You are a compensation research expert with deep knowledge of tech industry salaries.
Estimate realistic annual salary ranges in USD for each job opportunity based on title, company, location, and job type.

For each opportunity, return a JSON object with:
- min: integer (annual USD, no commas)
- max: integer (annual USD, no commas)  
- currency: "USD"
- label: short human-readable range, e.g. "~$120k – $150k" or "~$85k – $105k"
- confidence: "high" (well-known role), "medium" (reasonable estimate), or "low" (too vague to estimate well)

Return ONLY a valid JSON object mapping each opportunity ID to its range object.
Base estimates on 2026 market rates. For non-tech roles or unclear titles, use broader ranges.
Example:
{
  "uuid-1": { "min": 120000, "max": 150000, "currency": "USD", "label": "~$120k – $150k", "confidence": "high" },
  "uuid-2": { "min": 85000, "max": 110000, "currency": "USD", "label": "~$85k – $110k", "confidence": "medium" }
}`;

  const userMessage = `Estimate 2026 salary ranges for these opportunities:\n\n${opportunitiesText}\n\nReturn the JSON map now.`;

  // ── Call Claude Haiku ───────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let raw: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });
    raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  } catch (err) {
    return NextResponse.json(
      { error: "AI estimation failed: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  let ranges: Record<string, SalaryRange> = {};
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val !== "object" || val === null) continue;
      const v = val as Record<string, unknown>;
      const min = Math.max(0, Number(v.min ?? 0));
      const max = Math.max(min, Number(v.max ?? 0));
      const confidence = ["high", "medium", "low"].includes(String(v.confidence))
        ? (String(v.confidence) as "high" | "medium" | "low")
        : "medium";
      ranges[id] = {
        min,
        max,
        currency: String(v.currency ?? "USD"),
        label: String(v.label ?? `~$${Math.round(min / 1000)}k – $${Math.round(max / 1000)}k`),
        confidence,
      };
    }
  } catch {
    // Return empty rather than 500 — enrichment is non-critical
    return NextResponse.json({ ranges: {} });
  }

  return NextResponse.json({ ranges });
}
