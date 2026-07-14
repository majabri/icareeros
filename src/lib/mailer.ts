/**
 * iCareerOS — Shared Mailer
 * Server-only. Wraps nodemailer with Bluehost SMTP config.
 *
 * Reads the unified EMAIL_* credential set (shared with the IMAP consumer
 * in src/app/api/cron/check-bugs-inbox/route.ts). One mailbox
 * (bugs@icareeros.com), one password, two protocols — SMTP send (this
 * file) and IMAP read (bugs-inbox cron). See docs/EMAIL_DELIVERABILITY.md
 * for rotation procedure.
 *
 * Required env vars (set in Vercel + .env.local):
 *   EMAIL_HOST          e.g. mail.icareeros.com
 *   EMAIL_SMTP_PORT     e.g. 465 (SSL) or 587 (STARTTLS) — defaults to 465
 *   EMAIL_USER          SMTP auth username — MUST be a real Bluehost mailbox.
 *                       e.g. bugs@icareeros.com
 *   EMAIL_PASSWORD      the password of the EMAIL_USER mailbox. Same value
 *                       used by the IMAP consumer.
 *   ALERT_FROM_EMAIL    display \"From\" address shown to recipients.
 *                       CAN differ from EMAIL_USER, but Bluehost may reject
 *                       sends if it requires From=auth-user (test via the
 *                       relay before relying on a mismatch).
 *                       Defaults to EMAIL_USER.
 *                       e.g. noreply@icareeros.com
 */

import nodemailer from "nodemailer";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface MailResult {
  accepted: string[];
  rejected: string[];
  messageId: string;
}

/** Returns null when SMTP env vars are not set (e.g. in local dev without .env.local). */
function createTransporter() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_SMTP_PORT ?? "465", 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/** Resolved "From" address — prefers ALERT_FROM_EMAIL, falls back to EMAIL_USER. */
export function getFromAddress(): string {
  return (
    process.env.ALERT_FROM_EMAIL ??
    process.env.EMAIL_USER ??
    "noreply@icareeros.com"
  );
}

/**
 * Send a transactional email.
 * Returns null (no-op) when running without SMTP config (dev/test/preview).
 * Throws if SMTP is configured but the send fails.
 */
export async function sendMail(opts: MailOptions): Promise<MailResult | null> {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn("[mailer] SMTP not configured — skipping email send to:", opts.to);
    return null;
  }

  const from = getFromAddress();

  const info = await transporter.sendMail({
    from: `iCareerOS <${from}>`,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo ?? from,
  });

  return {
    accepted: info.accepted as string[],
    rejected: info.rejected as string[],
    messageId: info.messageId as string,
  };
}
