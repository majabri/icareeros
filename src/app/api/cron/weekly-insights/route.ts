/**
 * POST /api/cron/weekly-insights
 *
 * Vercel Cron job — runs every Sunday at 8am UTC.
 * Sends personalised weekly career insights to opted-in users.
 *
 * Protected by CRON_SECRET env var.
 * Required env vars: BLUEHOST_SMTP_*, NEXT_PUBLIC_SUPABASE_URL,
 *                    SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { sendMail } from "@/lib/mailer";
import { weeklyInsightsEmail, type WeeklyInsight } from "@/lib/emailTemplates";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailPrefRow {
  user_id: string;
  unsubscribe_token: string;
}

interface UserProfile {
  email: string;
  current_stage: string | null;
}

// ── AI insights generator ─────────────────────────────────────────────────────

async function generateInsights(
  stage: string,
  client: Anthropic,
): Promise<WeeklyInsight[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Generate 3 concise, actionable career insights for someone in the "${stage}" stage of their job search career OS cycle (Evaluate → Advise → Learn → Act → Coach → Achieve). Return JSON array: [{"category": "...", "content": "..."}]. Keep each content under 100 words. Be specific and practical.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "[]";

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned) as WeeklyInsight[];
  return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // 1. Fetch opted-in users
  const { data: prefs, error: prefsError } = await supabase
    .from("email_preferences")
    .select("user_id, unsubscribe_token")
    .eq("weekly_insights", true);

  if (prefsError) {
    console.error("[weekly-insights] Error fetching prefs:", prefsError.message);
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  if (!prefs || prefs.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, message: "No opted-in users" });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const pref of prefs as EmailPrefRow[]) {
    try {
      // 2. Fetch user email + career stage
      const { data: userData } = await supabase.auth.admin.getUserById(
        pref.user_id,
      );
      const email = userData?.user?.email;
      if (!email) { skipped++; continue; }

      // 3. Get career stage from latest cycle
      const { data: cycleData } = await supabase
        .from("career_os_cycles")
        .select("current_stage")
        .eq("user_id", pref.user_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const stage = (cycleData as UserProfile | null)?.current_stage ?? "evaluate";

      // 4. Count new job matches in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: newJobCount } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo);

      // 5. Generate insights with Claude Haiku
      let insights: WeeklyInsight[] = [];
      try {
        insights = await generateInsights(stage, anthropic);
      } catch {
        // Non-fatal — send digest without AI insights
        insights = [
          {
            category: "Career tip",
            content: `You're in the ${stage} stage. Keep making consistent progress — small steps compound over time.`,
          },
        ];
      }

      // 6. Build and send email
      const { subject, html, text } = weeklyInsightsEmail(
        email,
        insights,
        newJobCount ?? 0,
        stage.charAt(0).toUpperCase() + stage.slice(1),
      );

      await sendMail({ to: email, subject, html, text });
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${pref.user_id}: ${msg}`);
      skipped++;
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
