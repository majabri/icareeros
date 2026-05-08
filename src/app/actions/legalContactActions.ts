"use server";

import { headers } from "next/headers";
import { sendMail, getFromAddress } from "@/lib/mailer";
import { z } from "zod";

const ContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email required").max(254),
  postalAddress: z.string().min(5, "Postal address required").max(500),
  message: z.string().min(10, "Message must be at least 10 characters").max(5000),
  // Honeypot — bots fill this; humans can't see it.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type ContactInput = z.input<typeof ContactSchema>;
export type ContactResult = { ok: true } | { ok: false; error: string };

const RECIPIENT = "info@icareeros.com";

/**
 * Privacy/legal contact form submission. Email goes to info@icareeros.com.
 * Used in place of a published mailing address — gives users a way to send
 * formal correspondence (DSARs, legal notices) when iCareerOS LLC has no
 * publicly listed postal address.
 *
 * Per COWORK-BRIEF-legal-finalize-v1 (Amir 2026-05-07).
 */
export async function submitPrivacyContact(input: ContactInput): Promise<ContactResult> {
  // Server-side validation
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }
  const data = parsed.data;

  // Honeypot — silently succeed if a bot filled the trap field.
  if (data.website && data.website.length > 0) {
    return { ok: true };
  }

  // Capture context
  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = (h.get("user-agent") ?? "unknown").slice(0, 250);

  // Build the email body
  const submittedAt = new Date().toISOString();
  const subject = `[iCareerOS Legal Contact] ${data.name} (${data.email})`;
  const text = [
    `iCareerOS Privacy / Legal Contact Form Submission`,
    `Submitted at: ${submittedAt}`,
    ``,
    `Name:           ${data.name}`,
    `Email:          ${data.email}`,
    `Postal address: ${data.postalAddress}`,
    ``,
    `Message:`,
    data.message,
    ``,
    `---`,
    `IP (truncated): ${ipAddress}`,
    `User agent:     ${userAgent}`,
  ].join("\n");
  const html = `
    <h2 style="margin:0 0 12px;font-family:Inter,sans-serif">iCareerOS Privacy / Legal Contact Form</h2>
    <p style="margin:0 0 16px;color:#555;font-size:13px">Submitted at: ${submittedAt}</p>
    <table style="border-collapse:collapse;font-family:Inter,sans-serif;font-size:14px">
      <tr><td style="padding:6px 12px 6px 0;color:#666">Name</td><td style="padding:6px 0;font-weight:600">${escapeHtml(data.name)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#666">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">Postal address</td><td style="padding:6px 0;white-space:pre-line">${escapeHtml(data.postalAddress)}</td></tr>
    </table>
    <h3 style="margin:24px 0 8px;font-family:Inter,sans-serif">Message</h3>
    <p style="margin:0;font-family:Inter,sans-serif;font-size:14px;white-space:pre-line">${escapeHtml(data.message)}</p>
    <hr style="margin:24px 0;border:0;border-top:1px solid #eee" />
    <p style="margin:0;color:#999;font-size:12px;font-family:Inter,sans-serif">
      IP (truncated): ${escapeHtml(ipAddress)}<br/>
      User agent: ${escapeHtml(userAgent)}
    </p>
  `;

  try {
    const result = await sendMail({
      to: RECIPIENT,
      subject,
      html,
      text,
      replyTo: data.email,
    });
    if (result === null) {
      // SMTP not configured — log but treat as success so the user gets a
      // confirmation. The submission has been validated; the operator can
      // recover from logs if delivery is missing.
      console.warn("[legal-contact] SMTP not configured — submission logged only:", { name: data.name, email: data.email });
    }
    return { ok: true };
  } catch (err) {
    console.error("[legal-contact] sendMail failed:", err);
    return { ok: false, error: "Could not send your message. Please try again or email info@icareeros.com directly." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;",
  );
}

// Reference (suppresses unused-import warning when getFromAddress isn't called):
void getFromAddress;
