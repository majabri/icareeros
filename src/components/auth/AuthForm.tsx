"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { sendEmail } from "@/services/emailService";

interface AuthFormProps {
  mode: "login" | "signup";
}

// Username aliases → real Supabase email
const USERNAME_MAP: Record<string, string> = {
  azadmin: "azadmin@icareeros.com",
};

// Emails that land on /admin after login
const ADMIN_EMAILS = ["majabri714@gmail.com", "azadmin@icareeros.com"];

export function AuthForm({ mode }: AuthFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: identifier,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        sendEmail({
          to: identifier,
          subject: "Welcome to iCareerOS — your career OS is ready",
          html: `<p>Hi ${identifier},</p><p>Welcome to iCareerOS! <a href="${window.location.origin}/dashboard">Go to your dashboard</a>.</p>`,
          text: `Welcome to iCareerOS! Visit: ${window.location.origin}/dashboard`,
        }).catch(() => {});
        setSuccess(
          "Check your email — we've sent you a confirmation link to activate your account."
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          {mode === "login" ? "Email or username" : "Email address"}
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
                     focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={mode === "login" ? "you@example.com or username" : "you@example.com"}
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
                     focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !!success}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                   text-white shadow-sm hover:bg-blue-700 focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-blue-600
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
            <a href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-700">
              Sign up free
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700">
              Sign in
            </a>
          </>
        )}
      </p>
    </form>
  );
}
