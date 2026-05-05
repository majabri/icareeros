"use client";

/**
 * Sign in / Sign up with: Google, GitHub, LinkedIn.
 * (Apple deferred — needs $99/yr Apple Dev account.)
 *
 * Uses supabase.auth.signInWithOAuth. The provider must be enabled +
 * configured in Supabase Dashboard → Authentication → Providers, with
 * the Client ID + Secret obtained from each provider's developer console.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase";

type ProviderId = "google" | "github" | "linkedin_oidc";

const PROVIDERS: Array<{ id: ProviderId; label: string; icon: React.ReactNode }> = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="#4285F4" d="M21.6 12.227c0-.7-.063-1.373-.18-2.018H12v3.823h5.385a4.602 4.602 0 0 1-1.996 3.018v2.51h3.232c1.892-1.741 2.98-4.305 2.98-7.333Z"/>
        <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.62-2.44l-3.23-2.51c-.895.6-2.04.954-3.39.954-2.605 0-4.81-1.76-5.598-4.122H3.077v2.59A9.997 9.997 0 0 0 12 22Z"/>
        <path fill="#FBBC05" d="M6.402 13.882a5.997 5.997 0 0 1 0-3.764V7.527H3.077a10 10 0 0 0 0 8.946l3.325-2.59Z"/>
        <path fill="#EA4335" d="M12 5.978c1.467 0 2.787.504 3.825 1.498l2.866-2.867C16.96 2.99 14.694 2 12 2 8.13 2 4.787 4.222 3.077 7.527l3.325 2.59C7.19 7.738 9.395 5.978 12 5.978Z"/>
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.55l-.01-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.97.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.16l-.01 3.2c0 .31.21.67.8.55 4.56-1.53 7.85-5.84 7.85-10.92C23.5 5.66 18.34.5 12 .5Z" fill="#181717"/>
      </svg>
    ),
  },
  {
    id: "linkedin_oidc",
    label: "LinkedIn",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.65-1.86 3.4-1.86 3.64 0 4.31 2.4 4.31 5.51v6.24ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z"/>
      </svg>
    ),
  },
];

export function SocialLogins({ mode }: { mode: "login" | "signup" }) {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [err,  setErr]  = useState<string | null>(null);
  const supabase = createClient();

  async function start(provider: ProviderId) {
    setErr(null);
    setBusy(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not start ${provider} sign-in`);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => void start(p.id)}
            disabled={busy !== null}
            aria-label={`${mode === "login" ? "Sign in" : "Sign up"} with ${p.label}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {p.icon}
            <span className="hidden sm:inline">{busy === p.id ? "…" : p.label}</span>
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-white px-3 text-gray-400">or with email</span>
        </div>
      </div>
    </div>
  );
}
