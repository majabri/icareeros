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

interface ResumeUploadConsentArgs {
  userId: string;
  /** Optional — caller convenience; not persisted to consent_records. */
  email?: string;
}

/**
 * Records a 'resume_upload' consent_records row after a successful resume
 * upload. Called by the resume upload UI components (mycareer/profile and
 * resumeadvisor) once the file is parsed and saved.
 *
 * Captures one row per upload event so the audit trail can show exactly
 * which uploads the user explicitly consented to.
 *
 * Non-blocking — returns { ok: false } on error rather than throwing so
 * the caller's success path is never interrupted.
 */
export async function recordResumeUploadConsent(args: ResumeUploadConsentArgs): Promise<{ ok: boolean }> {
  try {
    const h = await headers();
    const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;

    await recordConsent([
      {
        userId: args.userId,
        email: args.email ?? "",
        consentType: "resume_upload",
        consented: true, // upload consent is binary — modal accept implies true
        ipAddress,
        userAgent,
      },
    ]);
    return { ok: true };
  } catch (err) {
    console.error("[recordResumeUploadConsent] failed:", err);
    return { ok: false };
  }
}

interface FoundingConsentArgs {
  userId: string;
  email?: string;
}

/**
 * Records a 'founding_nonrefundable' consent_records row after a successful
 * Founding offer purchase. Per COWORK-BRIEF-legal-deploy-v1 Phase 4.
 *
 * NOTE: Currently called from the stubbed payment flow on /founding. When
 * Stripe goes live (target: 2026-05-31), the call moves to the post-payment
 * callback (payment_intent.succeeded webhook handler) so consent is only
 * recorded for actual successful payments.
 *
 * Non-blocking — returns { ok: false } on error rather than throwing.
 */
export async function recordFoundingConsent(args: FoundingConsentArgs): Promise<{ ok: boolean }> {
  try {
    const h = await headers();
    const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;

    await recordConsent([
      {
        userId: args.userId,
        email: args.email ?? "",
        consentType: "founding_nonrefundable",
        consented: true,
        ipAddress,
        userAgent,
      },
    ]);
    return { ok: true };
  } catch (err) {
    console.error("[recordFoundingConsent] failed:", err);
    return { ok: false };
  }
}
