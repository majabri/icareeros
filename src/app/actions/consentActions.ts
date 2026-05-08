"use server";

import { headers } from "next/headers";
import { recordConsent } from "@/lib/consent/record-consent";

interface SignupConsentArgs {
  userId: string;
  email: string;
  privacyTerms: boolean;
  aiProcessing: boolean;
  marketingEmail: boolean;
}

/**
 * Records 3 consent_records rows after a successful signup:
 * - privacy_terms (required)
 * - ai_processing (required)
 * - marketing_email (optional — captured even when false so we have a record
 *   that the user was asked and declined)
 *
 * Caller (AuthForm) invokes this after `supabase.auth.signUp` returns the
 * user id. The user's auth cookie may not yet exist (email confirmation
 * pending), so the helper relies on the SUPABASE_SERVICE_ROLE_KEY to
 * bypass RLS for the insert.
 *
 * Non-blocking on the caller's success path: if this throws, the user has
 * still been created, only the audit row is missing. recordConsent itself
 * never throws, but we wrap defensively for the surrounding header reads.
 */
export async function recordSignupConsent(args: SignupConsentArgs): Promise<{ ok: boolean }> {
  try {
    const h = await headers();
    const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;

    await recordConsent([
      {
        userId: args.userId,
        email: args.email,
        consentType: "privacy_terms",
        consented: args.privacyTerms,
        ipAddress,
        userAgent,
      },
      {
        userId: args.userId,
        email: args.email,
        consentType: "ai_processing",
        consented: args.aiProcessing,
        ipAddress,
        userAgent,
      },
      {
        userId: args.userId,
        email: args.email,
        consentType: "marketing_email",
        consented: args.marketingEmail,
        ipAddress,
        userAgent,
      },
    ]);
    return { ok: true };
  } catch (err) {
    console.error("[recordSignupConsent] failed:", err);
    return { ok: false };
  }
}
