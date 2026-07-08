"use client";

/**
 * ForgotPasswordForm — client component for /auth/forgot-password.
 *
 * Enumeration-safe: always shows the same success message whether or not
 * the email exists. Errors from resetPasswordForEmail are logged to the
 * console for debugging but never surfaced to the user, so an attacker
 * can't sniff for valid accounts by watching the response.
 *
 * The redirect target is the same-origin /auth/callback with
 * ?type=recovery so the callback route can hand off to /auth/reset-password
 * after the code exchange. The redirectTo host is derived from
 * window.location.origin so the flow works on all three subdomains
 * (icareeros.com, jobs.icareeros.com, hire.icareeros.com) — every one
 * of those origins is covered by the Supabase URI_ALLOW_LIST wildcards.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export function ForgotPasswordForm() {
  const supabase = createClient();

  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) {
        // Log for us, but do NOT reveal to the user. Enumeration safety.
        // eslint-disable-next-line no-console
        console.error("[forgot-password] resetPasswordForEmail:", error.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[forgot-password] network error:", (err as Error).message);
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          If an account exists for that email, we&apos;ve sent a password
          reset link. Check your inbox — and your spam folder, just in case.
        </div>
        <p className="text-center text-sm text-gray-500">
          <a href="/auth/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to login
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     text-gray-900 placeholder-gray-400 shadow-sm
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="you@example.com"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                   text-white shadow-sm hover:bg-brand-700 focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-brand-600
                   disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-gray-500">
        Remembered it?{" "}
        <a href="/auth/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to login
        </a>
      </p>
    </form>
  );
}
