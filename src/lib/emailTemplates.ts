/**
 * iCareerOS — Email Templates
 * Returns HTML strings for transactional emails.
 * Brand: blue-950 (#0a1628) headers, blue-600 (#2563eb) CTAs.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://icareeros.vercel.app";

// ── Shared wrapper ────────────────────────────────────────────────────────────

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>iCareerOS</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0a1628;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.5px;">
              iCareerOS
            </span>
            <span style="color:#93c5fd;font-size:12px;margin-left:8px;">AI Career Operating System</span>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
              You're receiving this email because you have an account at
              <a href="${BASE_URL}" style="color:#2563eb;text-decoration:none;">iCareerOS</a>.
              &nbsp;·&nbsp;
              <a href="${BASE_URL}/settings/email" style="color:#2563eb;text-decoration:none;">Manage preferences</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}"
     style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;
            padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:24px;">
    ${label}
  </a>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

/**
 * Welcome email — sent after successful signup.
 */
export function welcomeEmail(userEmail: string): { subject: string; html: string; text: string } {
  const dashboardUrl = `${BASE_URL}/dashboard`;
  const subject = "Welcome to iCareerOS — your career OS is ready";

  const html = wrap(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      You're in. Let's build your career OS. 🚀
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${userEmail},<br/><br/>
      Welcome to iCareerOS — the AI-powered career operating system that runs your job search
      like a pro.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#0f172a;font-weight:600;">Here's what you can do right now:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#475569;line-height:2;">
      <li>📊 <strong>Dashboard</strong> — track your Career OS cycle (Evaluate → Achieve)</li>
      <li>🔍 <strong>Jobs</strong> — AI-scored opportunities matched to your profile</li>
      <li>🎙️ <strong>Interview</strong> — practice with an AI interviewer</li>
      <li>📄 <strong>Resume</strong> — parse, rewrite, and download your resume</li>
      <li>🤝 <strong>Offers</strong> — analyze and negotiate job offers</li>
    </ul>
    ${ctaButton(dashboardUrl, "Go to Dashboard →")}
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
      Questions? Reply to this email — we read every one.
    </p>
  `);

  const text = `Welcome to iCareerOS!

Hi ${userEmail},

Your account is ready. Head to your dashboard to start your career OS:
${dashboardUrl}

What you can do:
- Dashboard: track your Career OS cycle
- Jobs: AI-scored opportunities
- Interview: practice with AI
- Resume: parse, rewrite, download
- Offers: analyze and negotiate

Questions? Reply to this email.

— The iCareerOS team`;

  return { subject, html, text };
}

/**
 * Password-reset notification — sent after a successful password change.
 */
export function passwordResetNotificationEmail(userEmail: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your iCareerOS password was changed";

  const html = wrap(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Password changed
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${userEmail},<br/><br/>
      Your iCareerOS password was successfully changed. If you made this change, no further
      action is needed.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#dc2626;font-weight:500;">
      If you did <strong>not</strong> make this change, please reset your password immediately
      and contact support.
    </p>
    ${ctaButton(`${BASE_URL}/auth/login`, "Sign in to your account")}
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
      Need help? Reply to this email.
    </p>
  `);

  const text = `Hi ${userEmail},

Your iCareerOS password was successfully changed.

If you did NOT make this change, reset your password immediately:
${BASE_URL}/auth/login

— The iCareerOS team`;

  return { subject, html, text };
}

/**
 * Weekly insights digest email.
 */
export interface WeeklyInsight {
  category: string; // e.g. "New opportunities", "Interview tip"
  content: string;
}

export function weeklyInsightsEmail(
  userEmail: string,
  insights: WeeklyInsight[],
  newJobCount: number,
  careerStage: string,
): { subject: string; html: string; text: string } {
  const subject = `Your iCareerOS weekly digest — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

  const insightRows = insights
    .slice(0, 5)
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;font-size:11px;font-weight:600;color:#2563eb;
                       background:#eff6ff;padding:2px 8px;border-radius:12px;margin-bottom:6px;">
            ${i.category}
          </span>
          <p style="margin:4px 0 0;font-size:14px;color:#475569;line-height:1.5;">${i.content}</p>
        </td>
      </tr>`,
    )
    .join("");

  const html = wrap(`
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0f172a;">
      Your weekly career digest
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
      Career OS stage: <strong>${careerStage}</strong>
    </p>

    ${
      newJobCount > 0
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">
          🔍 ${newJobCount} new opportunities match your profile this week
        </p>
        ${ctaButton(`${BASE_URL}/jobs`, "View opportunities →")}
      </div>`
        : ""
    }

    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">This week's insights</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${insightRows || '<tr><td style="padding:12px 0;font-size:14px;color:#94a3b8;">No insights this week — check back soon.</td></tr>'}
    </table>

    ${ctaButton(`${BASE_URL}/dashboard`, "Open your Career OS →")}

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">
      <a href="${BASE_URL}/settings/email" style="color:#94a3b8;">Manage email preferences</a>
      &nbsp;·&nbsp;
      To unsubscribe from weekly digests, visit your
      <a href="${BASE_URL}/settings/email" style="color:#94a3b8;">email settings</a>.
    </p>
  `);

  const insightsText = insights
    .slice(0, 5)
    .map((i) => `[${i.category}] ${i.content}`)
    .join("\n");

  const text = `Your iCareerOS weekly digest

Career OS stage: ${careerStage}
${newJobCount > 0 ? `\n${newJobCount} new opportunities match your profile: ${BASE_URL}/jobs\n` : ""}
This week's insights:
${insightsText || "No insights this week."}

Open your Career OS: ${BASE_URL}/dashboard

Manage email preferences: ${BASE_URL}/settings/email`;

  return { subject, html, text };
}

/**
 * Job alert digest email — up to 5 matching opportunities.
 */
export interface AlertJob {
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  url: string | null;
}

export function jobAlertEmail(
  query: string | null,
  jobs: AlertJob[],
  frequency: "daily" | "weekly",
): { subject: string; html: string; text: string } {
  const count = jobs.length;
  const filterLabel = query ? `matching "${query}"` : "for you";
  const subject = `${count} new ${count === 1 ? "opportunity" : "opportunities"} ${filterLabel} — iCareerOS`;

  const jobRows = jobs
    .slice(0, 5)
    .map((j) => {
      const salary =
        j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k–$${Math.round(j.salary_max / 1000)}k`
          : j.salary_min
          ? `From $${Math.round(j.salary_min / 1000)}k`
          : null;
      const meta = [
        j.location,
        j.is_remote ? "Remote" : null,
        j.job_type,
        salary,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
            <a href="${j.url ?? `${BASE_URL}/jobs`}"
               style="font-size:15px;font-weight:600;color:#2563eb;text-decoration:none;">
              ${j.title}
            </a><br/>
            <span style="font-size:14px;color:#374151;">${j.company}</span>
            ${meta ? `<br/><span style="font-size:12px;color:#94a3b8;">${meta}</span>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  const html = wrap(`
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0f172a;">
      ${count} new ${count === 1 ? "match" : "matches"} found
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;">
      Your ${frequency} alert — ${filterLabel}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${jobRows}
    </table>
    ${ctaButton(`${BASE_URL}/jobs`, "View all opportunities →")}
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
      <a href="${BASE_URL}/jobs" style="color:#94a3b8;">Manage alerts</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}/settings/email" style="color:#94a3b8;">Email preferences</a>
    </p>
  `);

  const text = [
    `${count} new ${count === 1 ? "opportunity" : "opportunities"} ${filterLabel}`,
    "",
    ...jobs.slice(0, 5).map(
      (j) => `• ${j.title} at ${j.company}${j.location ? ` — ${j.location}` : ""}${j.url ? `\n  ${j.url}` : ""}`,
    ),
    "",
    `View all: ${BASE_URL}/jobs`,
    `Manage alerts: ${BASE_URL}/jobs`,
    `Email preferences: ${BASE_URL}/settings/email`,
  ].join("\n");

  return { subject, html, text };
}
