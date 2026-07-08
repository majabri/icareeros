"use client";

/**
 * ResetPasswordForm — client component for /auth/reset-password.
 *
 * The user arrives here after clicking the reset link in their email,
 * which routes through /auth/callback?type=recovery — that route
 * exchanges the code for a temporary recovery session and then
 * redirects here.
 *
 * On mount we call supabase.auth.getSession() to confirm the recovery
 * session is present. If it isn't (someone typed the URL directly,
 * or the link expired), we render the "expired-or-invalid" state
 * instead of the password form.
 *
 * On submit we call supabase.auth.updateUser({ password }). If the
 * update succeeds we show a success message and bounce to /auth/login
 * after ~2s. If it fails (session expired mid-form, etc.) we show the
 * same expired-or-invalid state so the user knows to request a new
 * link.
 *
 * Rules on the new password mirror the signup + settings/security
 * flow: minimum 8 characters and confirmation must match. Supabase's
 * server-side `password_min_length` is 6; the 8-character floor is
 * enforced client-side to match the rest of the app.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type ViewState =
  | { kind: "checking" }
  | { kind: "form" }
  | { kind: "invalid" }
  | { kind: "saving" }
  | { kind: "success" };

export function ResetPasswordForm() {
  const supabase = createClient();

  const [view, setView]                     = useState<ViewState>({ kind: "checking" });
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError]                   = useState<string | null>(null);

  // Session guard on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setView(data.session ? { kind: "form" } : { kind: "invalid" });
    })();
    return () => { cancelled = true; };
  // supabase is a stable singleton in this codebase — see src/lib/supabase.ts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setView({ kind: "saving" });
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        // Any error at this stage almost certainly means the recovery
        // session expired mid-form or the link was already used.
        // eslint-disable-next-line no-console
        console.error("[reset-password] updateUser:", updateErr.message);
        setView({ kind: "invalid" });
        return;
      }
      setView({ kind: "success" });
      setTimeout(() => {
        window.location.href = "/auth/login?reset=1";
      }, 2000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[reset-password] network error:", (err as Error).message);
      setView({ kind: "invalid" });
    }
  }

  if (view.kind === "checking") {
    return (
      <p role="status" className="text-center text-sm text-gray-500">
        Verifying reset link…
      </p>
    );
  }

  if (view.kind === "invalid") {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          This reset link has expired or is invalid. Please request a new one.
        </div>
        <p className="text-center text-sm text-gray-500">
          <a href="/auth/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
            Request a new reset link
          </a>
        </p>
      </div>
    );
  }

  if (view.kind === "success") {
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        ✓ Your password has been reset. Redirecting to sign in…
      </div>
    );
  }

  const disabled = view.kind === "saving";
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     text-gray-900 placeholder-gray-400 shadow-sm
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     text-gray-900 placeholder-gray-400 shadow-sm
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Retype the new password"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                   text-white shadow-sm hover:bg-brand-700 focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-brand-600
                   disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {disabled ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
