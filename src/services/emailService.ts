/**
 * iCareerOS — Email Service
 * Client-side wrapper around POST /api/email/send.
 *
 * Call from client components or server actions.
 * Fire-and-forget pattern recommended for UX (don't block the UI on email delivery).
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId: string | null;
  skipped: boolean; // true when SMTP not configured (dev/test)
}

/**
 * Send a transactional email via the internal /api/email/send route.
 * Throws on HTTP errors (4xx / 5xx).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const res = await fetch("/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    messageId?: string | null;
    skipped?: boolean;
  };

  if (!res.ok) {
    throw new Error(data.error ?? `Email send failed (${res.status})`);
  }

  return {
    ok: data.ok ?? true,
    messageId: data.messageId ?? null,
    skipped: data.skipped ?? false,
  };
}
