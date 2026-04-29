/**
 * POST /api/cron/job-alerts
 *
 * Vercel Cron job — runs daily at 8am UTC.
 * Sends job alert digest emails to opted-in users with active subscriptions.
 *
 * Protected by CRON_SECRET env var.
 * Required env vars: BLUEHOST_SMTP_*, NEXT_PUBLIC_SUPABASE_URL,
 *                    SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "@/lib/mailer";
import { jobAlertEmail, type AlertJob } from "@/lib/emailTemplates";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  user_id: string;
  query: string | null;
  is_remote: boolean;
  job_type: string | null;
  frequency: "daily" | "weekly";
  last_sent_at: string | null;
}

interface Opportunity {
  id: string;
  title: string;
  company: string;
  location: string | null;
  job_type: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  url: string | null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verify cron secret
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

  try {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 2. Load active subscriptions
    const { data: subs, error: subErr } = await supabase
      .from("job_alert_subscriptions")
      .select("id, user_id, query, is_remote, job_type, frequency, last_sent_at")
      .eq("is_active", true);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, total: 0 });
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sub of subs as Subscription[]) {
      try {
        // 3. Check frequency due date
        const cutoff = sub.frequency === "weekly" ? cutoff7d : cutoff24h;
        if (sub.last_sent_at && sub.last_sent_at > cutoff) {
          skipped++;
          continue;
        }

        // 4. Fetch user email
        const { data: userData } = await supabase.auth.admin.getUserById(sub.user_id);
        const userEmail = userData?.user?.email;
        if (!userEmail) { skipped++; continue; }

        // 5. Check email_preferences — respect job_alerts opt-out
        const { data: prefData } = await supabase
          .from("email_preferences")
          .select("job_alerts")
          .eq("user_id", sub.user_id)
          .single();

        // If row exists and job_alerts is explicitly false, skip
        if (prefData && prefData.job_alerts === false) {
          skipped++;
          continue;
        }

        // 6. Query matching opportunities since last send
        const since = sub.last_sent_at ?? cutoff;
        let q = supabase
          .from("opportunities")
          .select(
            "id, title, company, location, job_type, is_remote, salary_min, salary_max, salary_currency, url",
          )
          .eq("is_active", true)
          .gte("created_at", since)
          .order("quality_score", { ascending: false, nullsFirst: false })
          .limit(5);

        if (sub.query?.trim()) {
          q = q.or(
            `title.ilike.%${sub.query.trim()}%,company.ilike.%${sub.query.trim()}%`,
          );
        }
        if (sub.is_remote) q = q.eq("is_remote", true);
        if (sub.job_type) q = q.ilike("job_type", `%${sub.job_type}%`);

        const { data: jobs } = await q;

        // Always update last_sent_at to prevent retry spam
        await supabase
          .from("job_alert_subscriptions")
          .update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", sub.id);

        if (!jobs || jobs.length === 0) {
          skipped++;
          continue;
        }

        // 7. Build branded email and send via shared mailer
        const alertJobs: AlertJob[] = (jobs as Opportunity[]).map((j) => ({
          title: j.title,
          company: j.company,
          location: j.location,
          is_remote: j.is_remote,
          job_type: j.job_type,
          salary_min: j.salary_min,
          salary_max: j.salary_max,
          url: j.url,
        }));

        const { subject, html, text } = jobAlertEmail(
          sub.query,
          alertJobs,
          sub.frequency,
        );

        await sendMail({ to: userEmail, subject, html, text });
        sent++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`sub ${sub.id}: ${msg}`);
        skipped++;
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      total: subs.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[job-alerts cron] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
