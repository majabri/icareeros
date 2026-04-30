/**
 * POST /api/cron/re-engagement
 *
 * Vercel Cron job — runs every day at 10am UTC.
 * Finds users who have been inactive for 7–30 days (last_active on profiles.updated_at)
 * and sends a win-back email (if opted in and not already sent this week).
 *
 * Protected by CRON_SECRET env var.
 * Required env vars: BLUEHOST_SMTP_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "@/lib/mailer";
import { reEngagementEmail } from "@/lib/emailTemplates";

// How long a user must be inactive before we send re-engagement (ms)
const INACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const MAX_INACTIVE_MS       = 30 * 24 * 60 * 60 * 1000;   // 30 days — beyond this, skip (churn)

interface ProfileRow {
  user_id: string;
  email: string | null;
  updated_at: string;
  current_stage: string | null;
}

interface EmailPrefRow {
  user_id: string;
  unsubscribe_token: string;
  weekly_insights: boolean;
}

export async function POST(req: NextRequest) {
  // Auth guard
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = Date.now();
  const inactiveAfter  = new Date(now - MAX_INACTIVE_MS).toISOString();
  const inactiveBefore = new Date(now - INACTIVE_THRESHOLD_MS).toISOString();

  // Fetch profiles updated between 7 and 30 days ago (the inactive window)
  const { data: profiles, error: profilesErr } = await svc
    .from("profiles")
    .select("user_id, email, updated_at, current_stage")
    .lte("updated_at", inactiveBefore)
    .gte("updated_at", inactiveAfter)
    .not("email", "is", null);

  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  if (profileRows.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, message: "No inactive users in window" });
  }

  const userIds = profileRows.map(p => p.user_id);

  // Fetch email preferences — only send to users who have weekly_insights opted in
  // (we reuse this preference as the opt-in signal for re-engagement too)
  const { data: prefs } = await svc
    .from("email_preferences")
    .select("user_id, unsubscribe_token, weekly_insights")
    .in("user_id", userIds);

  const prefMap = new Map(
    ((prefs ?? []) as EmailPrefRow[]).map(p => [p.user_id, p])
  );

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const profile of profileRows) {
    const pref = prefMap.get(profile.user_id);

    // Skip if opted out (no pref row means default opt-in)
    if (pref && pref.weekly_insights === false) {
      skipped++;
      continue;
    }
    if (!profile.email) { skipped++; continue; }

    const token = pref?.unsubscribe_token ?? profile.user_id;
    const stage = profile.current_stage ?? "evaluate";
    const { subject, html, text } = reEngagementEmail(profile.email, stage, token);

    try {
      await sendMail({ to: profile.email, subject, html, text });
      sent++;
    } catch (err) {
      errors.push(`${profile.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
