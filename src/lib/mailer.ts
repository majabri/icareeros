/**
 * iCareerOS — Shared Mailer
 * Server-only. Wraps nodemailer with Bluehost SMTP config.
 *
 * Required env vars (set in Vercel + .env.local):
 *   BLUEHOST_SMTP_HOST  e.g. mail.icareeros.com
 *   BLUEHOST_SMTP_PORT  e.g. 465 (SSL) or 587 (STARTTLS) — defaults to 465
 *   BLUEHOST_SMTP_USER  e.g. bugs@icareeros.com
 *   BLUEHOST_SMTP_PASS  your Bluehost email password
 *   ALERT_FROM_EMAIL    display from address (defaults to BLUEHOST_SMTP_USER)
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
  const host = process.env.BLUEHOST_SMTP_HOST;
  const port = parseInt(process.env.BLUEHOST_SMTP_PORT ?? "465", 10);
  const user = process.env.BLUEHOST_SMTP_USER;
  const pass = process.env.BLUEHOST_SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/** Resolved "From" address — prefers ALERT_FROM_EMAIL, falls back to BLUEHOST_SMTP_USER. */
export function getFromAddress(): string {
  return (
    process.env.ALERT_FROM_EMAIL ??
    process.env.BLUEHOST_SMTP_USER ??
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
