import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a service-role Supabase client that bypasses RLS. */
function makeServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** True if a subscription's digest is due based on its frequency and last_sent_at. */
function isDue(frequency: string, lastSentAt: string | null): boolean {
  if (!lastSentAt) return true; // never sent → always due
  const now = Date.now();
  const last = new Date(lastSentAt).getTime();
  const hoursSince = (now - last) / 1000 / 60 / 60;
  if (frequency === "weekly") return hoursSince >= 168; // 7 days
  return hoursSince >= 23; // daily — allow a 1-hour drift window
}

/** Minimal HTML email body for a digest. */
function buildEmailHtml(params: {
  userEmail: string;
  query: string | null;
  isRemote: boolean;
  jobType: string | null;
  jobs: Array<{ id: string; title: string; company: string; location: string; url: string }>;
}): string {
  const { query, isRemote, jobType, jobs } = params;

  const subtitle = [
    query ? `"${query}"` : "all jobs",
    isRemote ? "Remote only" : null,
    jobType ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows = jobs
    .map(
      (j) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
        <a href="${j.url}" style="font-weight:600;color:#2563eb;text-decoration:none">${j.title}</a><br>
        <span style="color:#6b7280;font-size:14px">${j.company} &middot; ${j.location}</span>
      </td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f9fafb;margin:0;padding:0">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#2563eb;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">🔔 iCareerOS Job Alert</h1>
      <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px">${subtitle}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#374151;margin:0 0 16px">Here are your latest matching opportunities:</p>
      <table style="width:100%;border-collapse:collapse">
        ${rows}
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af">
        To manage your alerts, visit
        <a href="https://icareeros.com/jobs" style="color:#2563eb">icareeros.com/jobs</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler — called by Vercel Cron (or manually for testing)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Guard: require cron secret to prevent public access
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = makeServiceClient();
  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  const fromEmail =
    process.env.ALERT_FROM_EMAIL ?? "alerts@icareeros.com";

  // 1. Load all active subscriptions
  const { data: subs, error: subsErr } = await supabase
    .from("job_alert_subscriptions")
    .select("id, user_id, query, is_remote, job_type, frequency, last_sent_at")
    .eq("is_active", true);

  if (subsErr) {
    console.error("[cron/job-alerts] failed to load subscriptions:", subsErr.message);
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const sub of subs ?? []) {
    try {
      if (!isDue(sub.frequency, sub.last_sent_at)) {
        skipped++;
        continue;
      }

      // 2. Resolve user email via admin API
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(sub.user_id);
      if (userErr || !userData?.user?.email) {
        console.warn(`[cron/job-alerts] cannot resolve email for user ${sub.user_id}`);
        skipped++;
        continue;
      }
      const userEmail = userData.user.email;

      // 3. Find matching opportunities since last_sent_at (or last 24h if never sent)
      const since = sub.last_sent_at ?? new Date(Date.now() - 86_400_000).toISOString();

      let q = supabase
        .from("opportunities")
        .select("id, title, company, location, url")
        .eq("is_active", true)
        .gte("first_seen_at", since)
        .order("quality_score", { ascending: false, nullsFirst: false })
        .limit(10);

      if (sub.query?.trim()) {
        q = q.or(
          `title.ilike.%${sub.query.trim()}%,company.ilike.%${sub.query.trim()}%`
        );
      }
      if (sub.is_remote) q = q.eq("is_remote", true);
      if (sub.job_type)  q = q.ilike("job_type", `%${sub.job_type}%`);

      const { data: jobs, error: jobsErr } = await q;
      if (jobsErr) {
        console.warn(`[cron/job-alerts] job query error for sub ${sub.id}:`, jobsErr.message);
        skipped++;
        continue;
      }

      if (!jobs || jobs.length === 0) {
        skipped++;
        continue;
      }

      // 4. Send email via Resend (skip gracefully if key not configured)
      if (!resendApiKey) {
        console.warn("[cron/job-alerts] RESEND_API_KEY not set — skipping email send");
      } else {
        const html = buildEmailHtml({
          userEmail,
          query:    sub.query,
          isRemote: sub.is_remote,
          jobType:  sub.job_type,
          jobs,
        });

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    fromEmail,
            to:      [userEmail],
            subject: `🔔 ${jobs.length} new job${jobs.length > 1 ? "s" : ""} matched your alert`,
            html,
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text().catch(() => "");
          console.error(`[cron/job-alerts] Resend error for ${userEmail}:`, errText);
          skipped++;
          continue;
        }
      }

      // 5. Update last_sent_at
      await supabase
        .from("job_alert_subscriptions")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", sub.id);

      sent++;
    } catch (err) {
      console.error(`[cron/job-alerts] unexpected error for sub ${sub.id}:`, err);
      skipped++;
    }
  }

  const total = (subs ?? []).length;
  console.log(`[cron/job-alerts] done — sent=${sent} skipped=${skipped} total=${total}`);
  return NextResponse.json({ sent, skipped, total });
}
