"use client";

import { useState } from "react";
import { SocialLogins } from "@/components/auth/SocialLogins";
import { createClient } from "@/lib/supabase";
import { ConsentCheckboxes, type ConsentState } from "@/components/legal/ConsentCheckboxes";
import { recordSignupConsent } from "@/app/actions/consentActions";

export type UserRole = "job_seeker" | "employer";

interface AuthFormProps {
  mode: "login" | "signup";
  /**
   * Phase 1 subdomain (2026-05-16) — optional pre-selected role for
   * signup mode. The landing page CTAs and the hired.icareeros.com
   * signup link both pass `?role=employer` so the recruiter card
   * lights up by default. URL coming from job-seeker landing passes
   * `?role=job_seeker`. Either value pre-selects that card on mount.
   */
  initialRole?: UserRole;
}

// Username aliases → real Supabase email
const USERNAME_MAP: Record<string, string> = {
  azadmin: "azadmin@icareeros.com",
};

const INITIAL_CONSENT: ConsentState = {
  privacyTerms: false,
  aiProcessing: false,
  marketingEmail: false,
};

export function AuthForm({ mode, initialRole }: AuthFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [consentState, setConsentState] = useState<ConsentState>(INITIAL_CONSENT);
  const [allRequiredConsent, setAllRequiredConsent] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending]   = useState(false);
  const [resentMsg, setResentMsg]   = useState<string | null>(null);
  // Phase 1 subdomain (2026-05-16) — role selector for signup. Pre-fills
  // from `initialRole` prop (driven by `?role=` query string in page.tsx).
  // Form fields are hidden until a role is picked.
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(initialRole ?? null);

  const supabase = createClient();

  async function handleResend() {
    setResending(true);
    setResentMsg(null);
    try {
      const email = USERNAME_MAP[identifier.toLowerCase().trim()] ?? identifier.trim();
      if (!email) {
        setResentMsg("Enter your email above first.");
        return;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setResentMsg(`Sent again to ${email}. Check your inbox AND spam/promotions folders.`);
    } catch (e) {
      setResentMsg(e instanceof Error ? e.message : "Could not resend the email.");
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup" && !allRequiredConsent) {
      setError("Please accept the Privacy Policy + Terms and the AI processing disclosure to continue.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const email = identifier.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;

        // Audit trail. Non-blocking on UX — failures are logged server-side.
        try {
          if (data?.user?.id) {
            // Keep user_profiles.accepted_terms_at for back-compat with any
            // code that quick-checks "did this user accept the ToS?". The
            // canonical record now lives in consent_records (3 rows: privacy_terms,
            // ai_processing, marketing_email) written by the server action below.
            await supabase
              .from("user_profiles")
              .upsert(
                { user_id: data.user.id, accepted_terms_at: new Date().toISOString() },
                { onConflict: "user_id", ignoreDuplicates: false }
              );

            await recordSignupConsent({
              userId: data.user.id,
              email,
              privacyTerms: consentState.privacyTerms,
              aiProcessing: consentState.aiProcessing,
              marketingEmail: consentState.marketingEmail,
            });

            // Phase 1 subdomain (2026-05-16) — store the chosen role in
            // user_roles so the middleware's post-login redirect routes
            // them to jobs.* or hired.* on the next sign-in. Default
            // to job_seeker when the selector is somehow missing.
            const role: UserRole = selectedRole ?? "job_seeker";
            await supabase
              .from("user_roles")
              .upsert(
                { user_id: data.user.id, role },
                { onConflict: "user_id,role", ignoreDuplicates: true },
              );
          }
        } catch {
          // Don't block signup if the audit trail write fails.
        }

        // Confirmation email sent by Supabase Auth (Bluehost SMTP, branded template).
        setSuccess(
          `Check your inbox at ${email} — we sent you a link from bugs@icareeros.com to confirm your account. ` +
          `If you don't see it within a minute, check your Spam or Promotions folder.`
        );
        setNeedsConfirmation(true);
      } else {
        // Resolve username alias → email
        const email = USERNAME_MAP[identifier.toLowerCase().trim()] ?? identifier.trim();

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Phase 1 subdomain (2026-05-16) — route the user to the right
        // subdomain after sign-in based on their roles:
        //   admin                          → /admin (same host)
        //   employer ∧ job_seeker (dual)   → /auth/choose-platform
        //   employer                       → hired.icareeros.com/dashboard
        //   job_seeker (default)           → jobs.icareeros.com/dashboard
        //
        // Same decision table as middleware.ts. Duplicated here because
        // the post-login redirect is client-side (window.location.href)
        // and runs BEFORE the middleware sees the next request.
        let isAdmin = false;
        let isEmployer  = false;
        let isJobSeeker = false;

        if (data.user?.id) {
          // Admin check via profiles (binary + 5-tier admin_role).
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, admin_role")
            .eq("user_id", data.user.id)
            .maybeSingle();
          isAdmin = Boolean((profile as { admin_role?: string } | null)?.admin_role)
                 || profile?.role === "admin";

          // Role memberships from user_roles (multi-row table).
          if (!isAdmin) {
            const { data: roleRows } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", data.user.id);
            const roleSet = new Set(
              (roleRows ?? []).map((r) => (r as { role?: string }).role).filter(Boolean) as string[],
            );
            isEmployer  = roleSet.has("employer");
            isJobSeeker = roleSet.has("job_seeker") || roleSet.size === 0;
          }
        }

        // If the user explicitly requested a same-host destination via
        // ?redirect=, honour it (unless they're trying to sneak into
        // /admin without being an admin).
        const requested  = new URLSearchParams(window.location.search).get("redirect") ?? "";
        const wantsAdmin = requested.startsWith("/admin");

        const isProdHost = typeof window !== "undefined"
          && window.location.hostname.endsWith("icareeros.com");
        const jobsUrl    = process.env.NEXT_PUBLIC_JOBS_URL  ?? "https://jobs.icareeros.com";
        const hiredUrl   = process.env.NEXT_PUBLIC_HIRED_URL ?? "https://hired.icareeros.com";

        let dest: string;
        if (isAdmin) {
          dest = "/admin";
        } else if (requested && !wantsAdmin) {
          // Explicit redirect param wins for non-admin paths.
          dest = requested;
        } else if (isEmployer && isJobSeeker) {
          dest = "/auth/choose-platform";
        } else if (isEmployer) {
          dest = isProdHost ? `${hiredUrl}/dashboard` : "/hired/dashboard";
        } else {
          // Default + isJobSeeker
          dest = isProdHost ? `${jobsUrl}/dashboard` : "/dashboard";
        }
        window.location.href = dest;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      if (mode === "login" && /email[\s_-]?not[\s_-]?confirmed|email link|otp|confirm/i.test(msg)) {
        setNeedsConfirmation(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // Phase 1 subdomain (2026-05-16) — signup also gated on role selection.
  const submitDisabled =
    loading
    || !!success
    || (mode === "signup" && !allRequiredConsent)
    || (mode === "signup" && !selectedRole);

  // ── Role-selector cards (signup only) ─────────────────────────────────────
  const roleSelector = mode === "signup" ? (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Choose your path</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelectedRole("job_seeker")}
          aria-pressed={selectedRole === "job_seeker"}
          className={
            "rounded-xl border-2 px-4 py-4 text-left transition-all " +
            (selectedRole === "job_seeker"
              ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
              : "border-gray-200 bg-white hover:border-gray-300 " +
                (selectedRole ? "opacity-60" : ""))
          }
        >
          <div className="text-lg" aria-hidden>🎯</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            I&apos;m looking for a job
          </div>
          <p className="mt-1 text-xs text-gray-600 leading-snug">
            Career OS, AI coaching, job matching, interview prep and salary
            negotiation. Free to start.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setSelectedRole("employer")}
          aria-pressed={selectedRole === "employer"}
          className={
            "rounded-xl border-2 px-4 py-4 text-left transition-all " +
            (selectedRole === "employer"
              ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
              : "border-gray-200 bg-white hover:border-gray-300 " +
                (selectedRole ? "opacity-60" : ""))
          }
        >
          <div className="text-lg" aria-hidden>🏢</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            I&apos;m hiring talent
          </div>
          <p className="mt-1 text-xs text-gray-600 leading-snug">
            Search verified candidates, post jobs, AI-powered JD analysis and
            outreach. Starting at $49/mo.
          </p>
        </button>
      </div>
    </div>
  ) : null;

  // When in signup mode and no role chosen yet, render ONLY the role
  // selector — the email/password/consent block is gated behind a choice.
  const showCredentialBlock = mode === "login" || !!selectedRole;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {roleSelector}
      {showCredentialBlock && <SocialLogins mode={mode} />}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {needsConfirmation && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Didn&apos;t receive the email?</p>
          <p className="mt-1 text-xs text-amber-800">
            Check your <strong>Spam</strong> or <strong>Promotions</strong> folder. New domains often land there.
          </p>
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resending}
            className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend confirmation email"}
          </button>
          {resentMsg && (
            <p className="mt-2 text-xs text-amber-900">{resentMsg}</p>
          )}
        </div>
      )}

      {showCredentialBlock && <>
      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
          {mode === "login" ? "Email" : "Email address"}
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete={mode === "login" ? "username" : "email"}
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     text-gray-900 placeholder-gray-400 shadow-sm
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder={mode === "login" ? "you@example.com" : "you@example.com"}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     text-gray-900 placeholder-gray-400 shadow-sm
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
        />
      </div>

      {mode === "signup" && (
        <ConsentCheckboxes
          onChange={(state, allRequiredMet) => {
            setConsentState(state);
            setAllRequiredConsent(allRequiredMet);
          }}
        />
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                   text-white shadow-sm hover:bg-brand-700 focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-brand-600
                   disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {loading
          ? mode === "login" ? "Signing in…" : "Creating account…"
          : mode === "login" ? "Sign in" : "Create account"}
      </button>
      </>}

      {showCredentialBlock && (
      <p className="text-center text-sm text-gray-500">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <a href="/auth/signup" className="font-medium text-brand-600 hover:text-brand-700">
              Sign up free
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a href="/auth/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </a>
          </>
        )}
      </p>
      )}
    </form>
  );
}
