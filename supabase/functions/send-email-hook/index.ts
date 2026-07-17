// send-email-hook — Supabase Auth Send Email Hook receiver.
//
// Purpose
// -------
// GoTrue's built-in mailer signs each outbound email with our DKIM key,
// but its Message-ID contains an internal container hostname (something
// like <uuid@ip-10-0-x-x.us-east-2.compute.internal>). Bluehost's
// cloudfilter egress rewrites that Message-ID to @eig-obgw-*.ext.cloudfilter.net
// in transit, which invalidates the DKIM signature because Message-ID is
// inside the signed header set (h=). Result: dkim=fail at every receiver.
//
// This edge function intercepts each auth email GoTrue would otherwise
// send directly. We verify the webhook signature (proves the payload
// really came from Supabase), extract the OTP token_hash + action type,
// build a token_hash confirmation URL that lands on our own /auth/confirm
// route (never routes through supabase.co), then POST the payload to the
// Vercel relay /api/auth/send-email. The relay uses our nodemailer path
// which auto-generates <uuid@icareeros.com> Message-IDs that survive
// cloudfilter — dkim=pass.
//
// Deploy with `verify_jwt: false` — GoTrue calls this server-to-server
// with no user JWT; the webhook signature is the auth.
//
// See docs/EMAIL_DELIVERABILITY.md § "GoTrue Send Email Hook" (added in
// this PR).

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// ── Config ───────────────────────────────────────────────────────────────

// Supabase provides this in the format `v1,whsec_<base64>` when the hook
// is enabled in the dashboard. standardwebhooks accepts the whsec_ form,
// so we strip only the `v1,` prefix.
const rawHookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const HOOK_SECRET   = rawHookSecret.replace(/^v1,/, "");

// Shared secret with the Vercel relay. The relay validates
// `Authorization: Bearer ${AUTH_HOOK_RELAY_SECRET}` before sending.
const RELAY_SECRET  = Deno.env.get("AUTH_HOOK_RELAY_SECRET") ?? "";

// Site URL — where our /auth/confirm route lives. GoTrue also passes this
// in the payload (email_data.site_url), but we default to the icareeros.com
// production apex so a misconfigured project setting can't accidentally
// redirect auth links elsewhere.
const RELAY_ORIGIN  = Deno.env.get("RELAY_ORIGIN") ?? "https://icareeros.com";
const RELAY_URL     = `${RELAY_ORIGIN}/api/auth/send-email`;

// ── Types ────────────────────────────────────────────────────────────────

interface HookPayload {
  user: {
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailActionType;
    site_url: string;
    // Present when Secure Email Change is enabled:
    token_new?: string;
    token_hash_new?: string;
  };
}

type EmailActionType =
  | "signup"
  | "recovery"
  | "magiclink"
  | "email_change"
  | "invite";

// Payload posted to the Vercel relay.
interface RelayBody {
  to: string;
  emailActionType: EmailActionType;
  confirmationUrl: string;
  userEmail?: string;
}

// ── URL builder ──────────────────────────────────────────────────────────

// Option C (per Amir 2026-07-16): all auth links land on our /auth/confirm
// route via token_hash + verifyOtp, never on supabase.co. The confirm
// route knows how to route per type (signup → sign-out, recovery → reset,
// others → keep session and forward).
function buildConfirmUrl(
  siteUrl: string,
  tokenHash: string,
  type: EmailActionType,
): string {
  const origin = (siteUrl || RELAY_ORIGIN).replace(/\/+$/, "");
  const u = new URL(`${origin}/auth/confirm`);
  u.searchParams.set("token_hash", tokenHash);
  u.searchParams.set("type", type);
  return u.toString();
}

// ── Relay call ───────────────────────────────────────────────────────────

async function relay(body: RelayBody): Promise<Response> {
  return await fetch(RELAY_URL, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${RELAY_SECRET}`,
      "content-type":  "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status:  405,
      headers: { "content-type": "application/json" },
    });
  }

  if (!HOOK_SECRET) {
    console.error("[send-email-hook] SEND_EMAIL_HOOK_SECRET not set");
    return new Response(JSON.stringify({ error: "hook not configured" }), {
      status:  500,
      headers: { "content-type": "application/json" },
    });
  }
  if (!RELAY_SECRET) {
    console.error("[send-email-hook] AUTH_HOOK_RELAY_SECRET not set");
    return new Response(JSON.stringify({ error: "relay not configured" }), {
      status:  500,
      headers: { "content-type": "application/json" },
    });
  }

  // 1. Verify webhook signature. standardwebhooks throws on invalid.
  const rawBody = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(HOOK_SECRET);
    // wh.verify() returns the parsed body on success, throws on failure.
    payload = wh.verify(rawBody, {
      "webhook-id":        req.headers.get("webhook-id")        ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    }) as HookPayload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-email-hook] signature verification failed:", msg);
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status:  401,
      headers: { "content-type": "application/json" },
    });
  }

  // 2. Validate expected shape.
  const { user, email_data } = payload;
  if (!user?.email || !email_data?.token_hash || !email_data?.email_action_type) {
    console.error("[send-email-hook] malformed payload — missing required fields");
    return new Response(JSON.stringify({ error: "malformed payload" }), {
      status:  400,
      headers: { "content-type": "application/json" },
    });
  }

  const actionType = email_data.email_action_type;
  const siteUrl    = email_data.site_url;

  // 3. email_change gets special two-recipient handling if Secure Email
  //    Change is enabled (payload carries token_hash + token_hash_new).
  //    Field mapping per the Supabase docs Amir verified in the brief:
  //      token_hash      → sent to user.new_email
  //      token_hash_new  → sent to user.email (current)
  //    If token_hash_new is absent, Secure Email Change is off and we
  //    send only the one email to user.new_email.
  if (actionType === "email_change") {
    const results: Response[] = [];

    // Link to the NEW email address:
    if (user.new_email) {
      const urlToNew = buildConfirmUrl(siteUrl, email_data.token_hash, actionType);
      results.push(await relay({
        to:              user.new_email,
        emailActionType: actionType,
        confirmationUrl: urlToNew,
        userEmail:       user.email,
      }));
    }

    // Link to the CURRENT email address — only when Secure Email Change
    // is enabled (token_hash_new is present).
    if (email_data.token_hash_new) {
      const urlToCurrent = buildConfirmUrl(siteUrl, email_data.token_hash_new, actionType);
      results.push(await relay({
        to:              user.email,
        emailActionType: actionType,
        confirmationUrl: urlToCurrent,
        userEmail:       user.email,
      }));
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      const first = failed[0];
      const text  = await first.text().catch(() => "");
      console.error(
        `[send-email-hook] email_change relay failure: ${failed.length}/${results.length} failed`,
        `first_status=${first.status}`,
        `first_body=${text}`,
      );
      return new Response(JSON.stringify({ error: "relay failed", detail: text }), {
        status:  502,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, sent: results.length }), {
      status:  200,
      headers: { "content-type": "application/json" },
    });
  }

  // 4. All other types — single recipient (user.email), single URL.
  const url = buildConfirmUrl(siteUrl, email_data.token_hash, actionType);
  const res = await relay({
    to:              user.email,
    emailActionType: actionType,
    confirmationUrl: url,
    userEmail:       user.email,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[send-email-hook] relay failure: status=${res.status} body=${text}`);
    return new Response(JSON.stringify({ error: "relay failed", detail: text }), {
      status:  502,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { "content-type": "application/json" },
  });
});
