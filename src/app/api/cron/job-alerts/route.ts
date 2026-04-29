/**
 * POST /api/cron/job-alerts
 *
 * Vercel Cron job — runs daily to send job alert digest emails.
 * Protected by CRON_SECRET env var (set in Vercel → Environment Variables).
 *
 * Email delivery via Bluehost SMTP (nodemailer).
 * Required env vars:
 *   BLUEHOST_SMTP_HOST  e.g. mail.icareeros.com
 *   BLUEHOST_SMTP_PORT  e.g. 465 (SSL) or 587 (STARTTLS) — defaults to 465
 *   BLUEHOST_SMTP_USER  e.g. alerts@icareeros.com
 *   BLUEHOST_SMTP_PASS  your Bluehost email password
 *   ALERT_FROM_EMAIL    display from address (defaults to BLUEHOST_SMTP_USER)
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

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

// ── SMTP transporter (lazy singleton) ────────────────────────────────────────

function createTransporter() {
  const host = process.env.BLUEHOST_SMTP_HOST;
  const port = parseInt(process.env.BLUEHOST_SMTP_PORT ?? "465", 10);
  const user = process.env.BLUEHOST_SMTP_USER;
  const pass = process.env.BLUEHOST_SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user, pass },
  });
}

// ── Email builder ─────────────────────────────────────────────────────────────

function buildEmailHtml(sub: Subscription, jobs: Opportunity[]): string {
  const jobRows = jobs
    .slice(0, 10)
    .map((j) => {
      const salary =
        j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k - $${Math.round(j.salary_max / 1000)}k`
          : null;
      const meta = [j.location, j.is_remote ? "Remote" : null, j.job_type, salary]
        .filter(Boolean)
        .join(" · ");
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f0f0f0">
            <a href="${j.url || "https://icareeros.com/jobs"}" style="font-weight:600;color:#2563eb;text-decoration:none">
              ${j.title}
            </a><br>
            <span style="color:#555;font-size:14px">${j.company}</span>
            ${meta ? `<br><span style="color:#888;font-size:13px">${meta}</span>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  const filterDesc = [
    sub.query ? `matching "${sub.query}"` : "all roles",
    sub.is_remote ? "remote only" : null,
    sub.job_type ? sub.job_type : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <div style="margin-bottom:24px">
    <a href="https://icareeros.com" style="font-weight:700;color:#2563eb;text-decoration:none;font-size:18px">
      iCareerOS
    </a>
  </div>
  <h2 style="margin:0 0 8px">Your ${sub.frequency} job alert</h2>
  <p style="color:#555;margin:0 0 24px">
    ${jobs.length} new ${jobs.length === 1 ? "opportunity" : "opportunities"} — ${filterDesc}
  </p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${jobRows}
  </table>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee">
    <a href="https://icareeros.com/jobs" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
      View all opportunities
    </a>
  </div>
  <p style="color:#aaa;font-size:12px;margin-top:24px">
    You're receiving this because you set up a job alert on iCareerOS.<br>
    <a href="https://icareeros.com/jobs" style="color:#aaa">Manage alerts</a>
  </p>
</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fromEmail =
    process.env.ALERT_FROM_EMAIL ??
    process.env.BLUEHOST_SMTP_USER ??
    "alerts@icareeros.com";

  // 2. Use service role to bypass RLS (cron reads all subscriptions)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Build SMTP transporter (null if not configured)
  const transporter = createTransporter();
  if (!transporter) {
    console.warn("[job-alerts cron] SMTP not configured — emails will be skipped");
  }

  try {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    const cutoff7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 4. Load active subscriptions
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

    for (const sub of subs as Subscription[]) {
      // Check if due for sending based on frequency
      const cutoff = sub.frequency === "weekly" ? cutoff7d : cutoff24h;
      if (sub.last_sent_at && sub.last_sent_at > cutoff) {
        skipped++;
        continue;
      }

      // 5. Fetch user email via admin API
      const { data: userData } = await supabase.auth.admin.getUserById(sub.user_id);
      const userEmail = userData?.user?.email;
      if (!userEmail) { skipped++; continue; }

      // 6. Query matching opportunities created since last send
      const since = sub.last_sent_at ?? cutoff;
      let q = supabase
        .from("opportunities")
        .select("id, title, company, location, job_type, is_remote, salary_min, salary_max, salary_currency, url")
        .eq("is_active", true)
        .gte("created_at", since)
        .order("quality_score", { ascending: false, nullsFirst: false })
        .limit(10);

      if (sub.query?.trim()) {
        q = q.or(`title.ilike.%${sub.query.trim()}%,company.ilike.%${sub.query.trim()}%`);
      }
      if (sub.is_remote) q = q.eq("is_remote", true);
      if (sub.job_type)  q = q.ilike("job_type", `%${sub.job_type}%`);

      const { data: jobs } = await q;

      // Update last_sent_at even if no jobs (prevents re-query spam)
      await supabase
        .from("job_alert_subscriptions")
        .update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", sub.id);

      if (!jobs || jobs.length === 0) {
        skipped++;
        continue;
      }

      // 7. Send email via Bluehost SMTP
      if (transporter) {
        const html = buildEmailHtml(sub, jobs as Opportunity[]);
        const subject = `${jobs.length} new job${jobs.length === 1 ? "" : "s"} match your iCareerOS alert`;

        try {
          await transporter.sendMail({
            from: `"iCareerOS Alerts" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
          });
          sent++;
        } catch (mailErr) {
          console.error(`[job-alerts cron] SMTP error for ${userEmail}:`, mailErr);
          skipped++;
        }
      } else {
        console.log(`[job-alerts cron] Would send to ${userEmail} — ${jobs.length} jobs (SMTP not configured)`);
        sent++; // count as "would send" for logging
      }
    }

    return NextResponse.json({ sent, skipped, total: subs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[job-alerts cron] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
