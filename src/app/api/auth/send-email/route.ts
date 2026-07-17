/**
 * /api/auth/send-email — thin relay from the Supabase Send Email Hook
 * to our nodemailer path in src/lib/mailer.ts.
 *
 * Why this exists
 * ---------------
 * Auth emails sent directly by GoTrue (Supabase Auth) fail DKIM at every
 * major receiver because GoTrue's Message-ID is generated from its internal
 * container hostname (something like `<uuid@ip-10-0-x-x.us-east-2.compute.internal>`),
 * and Bluehost's cloudfilter egress rewrites that Message-ID to
 * `@eig-obgw-*.ext.cloudfilter.net` in transit. Because Message-ID is
 * inside the signed header set (h=), the rewrite invalidates the DKIM
 * signature -> dkim=fail at Gmail/Outlook/etc.
 *
 * Our app-side mailer (nodemailer 9.0.1) auto-generates a Message-ID
 * of the form `<uuid@icareeros.com>` from the From address domain, and
 * that pattern survives cloudfilter intact (verified end-to-end).
 *
 * The Supabase Send Email Hook lets GoTrue defer email generation to a
 * webhook. Our edge function (supabase/functions/send-email-hook) verifies
 * the webhook signature and forwards the payload here. This route selects
 * a template by emailActionType, calls sendMail(), and returns 200/{ok}
 * so GoTrue considers the email delivered.
 *
 * Security
 * --------
 * The endpoint is server-to-server only. Every request must present
 *   Authorization: Bearer <AUTH_HOOK_RELAY_SECRET>
 * with the secret matching the one shared with the edge function.
 * Bearer comparison uses a timing-safe equality (constant-time in the
 * length-matched path) so we don't leak the secret through response
 * timing. No CORS is emitted for cross-origin callers.
 *
 * Behavior
 * --------
 * - Requires AUTH_HOOK_RELAY_SECRET in the process env. If not set, we
 *   500 rather than silently degrade — an auth-email drop is worse than
 *   most transactional drops.
 * - If mailer.ts's sendMail() returns null (SMTP env not set — the "no-op
 *   in preview" case), we 500 so the edge function surfaces the failure.
 * - If Bluehost rejects the recipient (rejected[] non-empty), we 502.
 * - On success we return the messageId so the edge function can log it.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

interface RelayBody {
  to: string;
  emailActionType: EmailActionType;
  confirmationUrl: string;
  userEmail?: string;
}

type EmailActionType =
  | "recovery"
  | "signup"
  | "magiclink"
  | "email_change"
  | "invite";

interface Template {
  subject: string;
  html: string;
  text: string;
}

// ── Templates ────────────────────────────────────────────────────────────

function buildTemplate(actionType: EmailActionType, url: string): Template {
  switch (actionType) {
    case "recovery":
      return {
        subject: "Reset your iCareerOS password",
        text: [
          "Someone requested a password reset for your iCareerOS account.",
          "",
          "If this was you, use the link below to choose a new password:",
          url,
          "",
          "If you didn't request this, you can safely ignore this email — your password won't change.",
          "",
          "— iCareerOS",
        ].join("\n"),
        html: buttonEmail({
          heading: "Reset your password",
          intro:   "Someone requested a password reset for your iCareerOS account. If this was you, click below to choose a new password:",
          button:  "Reset password",
          url,
          footer:  "If you didn't request this, you can safely ignore this email — your password won't change.",
        }),
      };

    case "signup":
      return {
        subject: "Confirm your iCareerOS email",
        text: [
          "Welcome to iCareerOS.",
          "",
          "Please confirm your email address:",
          url,
          "",
          "If you didn't sign up for iCareerOS, you can safely ignore this email.",
          "",
          "— iCareerOS",
        ].join("\n"),
        html: buttonEmail({
          heading: "Welcome to iCareerOS",
          intro:   "Please confirm your email address to activate your account:",
          button:  "Confirm email",
          url,
          footer:  "If you didn't sign up for iCareerOS, you can safely ignore this email.",
        }),
      };

    case "magiclink":
      return {
        subject: "Your iCareerOS sign-in link",
        text: [
          "Click the link below to sign in to iCareerOS:",
          url,
          "",
          "This link is single-use and expires in one hour.",
          "",
          "If you didn't request this, someone may have entered your email by mistake. You can safely ignore this email.",
          "",
          "— iCareerOS",
        ].join("\n"),
        html: buttonEmail({
          heading: "Sign in to iCareerOS",
          intro:   "Click below to sign in to iCareerOS. This link is single-use and expires in one hour.",
          button:  "Sign in",
          url,
          footer:  "If you didn't request this, someone may have entered your email by mistake. You can safely ignore this email.",
        }),
      };

    case "email_change":
      return {
        subject: "Confirm your new email address",
        text: [
          "You're changing the email address on your iCareerOS account.",
          "",
          "Confirm the change here:",
          url,
          "",
          "If you didn't request this, please sign in and change your password immediately.",
          "",
          "— iCareerOS",
        ].join("\n"),
        html: buttonEmail({
          heading: "Confirm your new email",
          intro:   "You're changing the email address on your iCareerOS account. Click below to confirm the change:",
          button:  "Confirm new email",
          url,
          footer:  "If you didn't request this, please sign in and change your password immediately.",
        }),
      };

    case "invite":
      return {
        subject: "You've been invited to iCareerOS",
        text: [
          "You've been invited to join iCareerOS.",
          "",
          "Accept the invitation here:",
          url,
          "",
          "— iCareerOS",
        ].join("\n"),
        html: buttonEmail({
          heading: "You're invited to iCareerOS",
          intro:   "Someone has invited you to join iCareerOS. Click below to accept the invitation and create your account:",
          button:  "Accept invite",
          url,
          footer:  "If you weren't expecting an invitation, you can safely ignore this email.",
        }),
      };
  }
}

interface EmailShellOpts {
  heading: string;
  intro:   string;
  button:  string;
  url:     string;
  footer:  string;
}

function buttonEmail({ heading, intro, button, url, footer }: EmailShellOpts): string {
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">`,
    `  <h2 style="font-size:20px;margin:0 0 16px 0">${heading}</h2>`,
    `  <p style="line-height:1.5">${intro}</p>`,
    `  <p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 24px;background:#00B8A9;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">${button}</a></p>`,
    `  <p style="font-size:12px;color:#666;word-break:break-all">If the button doesn't work, copy and paste this URL into your browser:<br/><a href="${url}" style="color:#00B8A9">${url}</a></p>`,
    `  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />`,
    `  <p style="font-size:12px;color:#888">${footer}</p>`,
    `  <p style="font-size:12px;color:#888">— iCareerOS</p>`,
    `</div>`,
  ].join("\n");
}

// ── Bearer auth ──────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const relaySecret = process.env.AUTH_HOOK_RELAY_SECRET;
  if (!relaySecret) {
    console.error("[auth/send-email] AUTH_HOOK_RELAY_SECRET not set — refusing");
    return NextResponse.json(
      { error: "server not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const expected   = `Bearer ${relaySecret}`;
  if (!timingSafeEqual(authHeader, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RelayBody;
  try {
    body = (await req.json()) as RelayBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { to, emailActionType, confirmationUrl } = body;
  if (typeof to !== "string" || !to.includes("@")) {
    return NextResponse.json({ error: "missing or invalid 'to'" }, { status: 400 });
  }
  if (typeof confirmationUrl !== "string" || !confirmationUrl.startsWith("http")) {
    return NextResponse.json({ error: "missing or invalid 'confirmationUrl'" }, { status: 400 });
  }
  const allowedTypes: EmailActionType[] = [
    "recovery", "signup", "magiclink", "email_change", "invite",
  ];
  if (!allowedTypes.includes(emailActionType)) {
    return NextResponse.json({ error: "unknown emailActionType" }, { status: 400 });
  }

  const template = buildTemplate(emailActionType, confirmationUrl);
  try {
    const result = await sendMail({
      to,
      subject: template.subject,
      html:    template.html,
      text:    template.text,
    });
    if (result === null) {
      console.error("[auth/send-email] mailer returned null — SMTP env not configured");
      return NextResponse.json(
        { error: "mailer not configured" },
        { status: 500 },
      );
    }
    if (result.rejected.length > 0) {
      console.error("[auth/send-email] recipient rejected:", result.rejected);
      return NextResponse.json(
        { error: "recipient rejected", rejected: result.rejected },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/send-email] send failed:", msg);
    return NextResponse.json(
      { error: "send failed", detail: msg },
      { status: 500 },
    );
  }
}
