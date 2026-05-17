/**
 * Server-side consent recorder. Bridges the brief's API
 * (`recordConsent([{ consentType, consented, ... }])`) to the existing
 * `consent_records` schema from 20260505_legal_readiness_consent.
 *
 * Schema reminder (do NOT change):
 *   kind            consent_kind  -- 'cookie' | 'tos' | 'privacy_terms' |
 *                                 --   'ai_processing' | 'marketing_email' |
 *                                 --   'resume_upload' | 'founding_nonrefundable'
 *   necessary       boolean NOT NULL  -- for cookie kinds: necessary tier opt-in
 *   functional      boolean NOT NULL  -- for cookie kinds: functional opt-in
 *   analytics       boolean NOT NULL  -- for cookie kinds: analytics opt-in
 *   marketing       boolean NOT NULL  -- for cookie kinds: marketing opt-in
 *   gpc_detected    boolean
 *   ip_hash         text  -- sha256(ip + CONSENT_IP_SALT)
 *   user_agent      text  -- truncated to 250 chars
 *
 * For typed (non-cookie) consents the four bool flags are uniformly set to
 * `consented` so the row's affirmative/negative state is preserved while the
 * semantic meaning lives in `kind`. The `email` argument from the brief's API
 * is accepted for forward-compatibility but NOT persisted (the schema doesn't
 * have an email column — the user_id FK is the canonical link).
 *
 * NEVER throws. Failures log to console only.
 */

import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { createHash } from "node:crypto";

export type ConsentType =
  | "privacy_terms"
  | "ai_processing"
  | "marketing_email"
  | "resume_upload"
  | "founding_nonrefundable"
  | "cookie_all"
  | "cookie_necessary"
  | "tos";

export interface ConsentRecordInput {
  /** Authed user id when available (server action context). */
  userId?: string | null;
  /** Caller convenience — accepted for forward-compatibility but not persisted. */
  email?: string;
  /** Anonymized session identifier for pre-login flows. */
  sessionId?: string;
  /** What consent surface this row represents. */
  consentType: ConsentType;
  /** Did the user consent? Typed consents store this uniformly across bool flags. */
  consented: boolean;
  /** Raw IP — hashed with CONSENT_IP_SALT before storage. Never persisted in raw form. */
  ipAddress?: string | null;
  /** User-agent string — truncated to 250 chars before storage. */
  userAgent?: string | null;
  /** Was the GPC signal detected for this user? Cookie consents only. */
  gpcDetected?: boolean;
}

interface ConsentRow {
  user_id: string | null;
  session_id: string | null;
  schema_version: number;
  kind: "cookie" | "tos" | "privacy_terms" | "ai_processing" | "marketing_email" | "resume_upload" | "founding_nonrefundable";
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  gpc_detected: boolean;
  ip_hash: string | null;
  user_agent: string | null;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.CONSENT_IP_SALT;
  if (!salt) return null;
  return createHash("sha256").update(ip + salt).digest("hex");
}

function toRow(input: ConsentRecordInput): ConsentRow {
  const consented = input.consented;
  const gpc = input.gpcDetected ?? false;
  const userAgent = input.userAgent ? input.userAgent.slice(0, 250) : null;
  const ipHash = hashIp(input.ipAddress ?? undefined);

  switch (input.consentType) {
    case "cookie_all":
      return {
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        schema_version: 1,
        kind: "cookie",
        necessary: true,
        functional: consented,
        analytics: consented,
        marketing: consented,
        gpc_detected: gpc,
        ip_hash: ipHash,
        user_agent: userAgent,
      };
    case "cookie_necessary":
      return {
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        schema_version: 1,
        kind: "cookie",
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
        gpc_detected: gpc,
        ip_hash: ipHash,
        user_agent: userAgent,
      };
    case "privacy_terms":
    case "ai_processing":
    case "marketing_email":
    case "resume_upload":
    case "founding_nonrefundable":
    case "tos":
      // Typed consents: bool flags uniformly mirror `consented`.
      return {
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        schema_version: 1,
        kind: input.consentType,
        necessary: consented,
        functional: consented,
        analytics: consented,
        marketing: consented,
        gpc_detected: gpc,
        ip_hash: ipHash,
        user_agent: userAgent,
      };
  }
}

/**
 * Record one or more consent events. Non-blocking — never throws.
 * Caller must be in a Next.js server context (server action, route handler,
 * middleware) — `cookies()` is required to construct the Supabase client.
 */
export async function recordConsent(records: ConsentRecordInput[]): Promise<void> {
  if (!records || records.length === 0) return;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      // Service-role preferred (bypasses RLS for inserts); falls back to anon
      // so unit tests + dev environments without service role still work.
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
            cs.forEach(({ name, value, options }) => cookieStore.set(name, value, withCrossSubdomainCookie(options)));
          },
        },
      },
    );

    const rows = records.map(toRow);
    const { error } = await supabase.from("consent_records").insert(rows);
    if (error) {
      console.error("[consent] Failed to record:", error.message);
    }
  } catch (err) {
    console.error("[consent] Unexpected error:", err);
  }
}
