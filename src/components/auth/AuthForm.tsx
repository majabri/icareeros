"use client";

import { useState } from "react";
import { SocialLogins } from "@/components/auth/SocialLogins";
import { createClient } from "@/lib/supabase";
import { readConsent } from "@/lib/consent/storage";
import { postConsent } from "@/lib/consent/api";

interface AuthFormProps {
  mode: "login" | "signup";
}

// Username aliases → real Supabase email
const USERNAME_MAP: Record<string, string> = {
  azadmin: "azadmin@icareeros.com",
};

// Emails that land on /admin after login
const ADMIN_EMAILS = ["azadmin@icareeros.com", "majabri714@gmail.com"];

export function AuthForm({ mode }: AuthFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup" && !acceptTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: identifier,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;

        // Record ToS+Privacy acceptance:
        // 1) accepted_terms_at on user_profiles (handled by row's INSERT trigger
        //    on first profile creation; we also POST a consent_records row for
        //    audit trail purposes — it's append-only and survives profile edits).
        // 2) consent_records row (kind = 'tos').
        try {
          if (data?.user?.id) {
            await supabase
              .from("user_profiles")
              .upsert(
                { user_id: data.user.id, accepted_terms_at: new Date().toISOString() },
                { onConflict: "user_id", ignoreDuplicates: false }
              );
          }
          const cookieConsent = readConsent();
          await postConsent(
            cookieConsent ?? {
              version: 1,
              timestamp: new Date().toISOString(),
              necessary: true,
              functional: false,
              analytics: false,
              marketing: false,
              gpcDetected: false,
            },
            "tos",
          );
        } catch {
          // Don't block signup if the audit trail write fails.
        }

        // Confirmation email is sent by Supabase Auth using the branded
        // template configured in dashboard → Authentication → Emails.
        setSuccess(
          "Check your inbox — we just sent you an email from iCareerOS with a link to confirm your account. Click it to finish signing up."
        );
      } else {
        // Resolve username alias → email
        const email = USERNAME_MAP[identifier.toLowerCase().trim()] ?? identifier.trim();

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Admin users go to /admin; everyone else to /dashboard (or ?redirect=)
        const isAdmin = ADMIN_EMAILS.includes(data.user?.email ?? "");
        const redirect = new URLSearchParams(window.location.search).get("redirect");
        window.location.href = redirect ?? (isAdmin ? "/admin" : "/dashboard");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled = loading || !!success || (mode === "signup" && !acceptTerms);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SocialLogins mode={mode} />
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
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            id="accept-terms"
            data-testid="accept-terms"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            required
          />
          <span>
            I agree to the{" "}
            <a href="/legal/terms" className="font-medium text-brand-700 underline hover:text-brand-800">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" className="font-medium text-brand-700 underline hover:text-brand-800">
              Privacy Policy
            </a>
            .
          </span>
        </label>
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
    </form>
  );
}
