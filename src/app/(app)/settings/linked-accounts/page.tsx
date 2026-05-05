"use client";

/**
 * /settings/linked-accounts
 *
 * Lets the user link/unlink third-party identity providers and choose to
 * sign in with any of them. All providers below are FREE for end users:
 *   - Google   (free)
 *   - GitHub   (free)
 *   - LinkedIn (free — uses Sign In with LinkedIn / OIDC)
 *   - Apple    (Apple Developer Program required at $99/yr — shown as "Coming Soon")
 *
 * A primary email/password identity is always kept; we prevent the user
 * from unlinking their LAST identity to avoid getting locked out.
 *
 * Data pull where free + supported:
 *   - Google   → email, name, avatar  (OIDC standard claims)
 *   - GitHub   → bio, public repos, primary languages → can populate
 *                career_profile.skills + headline  (future enhancement)
 *   - LinkedIn → email, name, avatar, member-id → can derive linkedin_url
 *
 * The actual provider configuration (Client ID / Secret) lives in the
 * Supabase Dashboard → Authentication → Providers. This page only drives
 * the OAuth flow via supabase.auth.linkIdentity / unlinkIdentity.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { UserIdentity } from "@supabase/supabase-js";

type ProviderId = "google" | "github" | "linkedin_oidc" | "apple";

interface ProviderDef {
  id:       ProviderId;
  label:    string;
  icon:     React.ReactNode;
  free:     boolean;
  comingSoon?: boolean;
  hint:     string;
}

// ── Provider catalogue ─────────────────────────────────────────────────────

const PROVIDERS: ProviderDef[] = [
  {
    id: "google",
    label: "Google",
    free: true,
    hint: "Sign in with Google. Pulls your email, name, and avatar.",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
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
    free: true,
    hint: "Sign in with GitHub. Useful for technical roles — we can pull your bio and top public repos.",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.55l-.01-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.97.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.16l-.01 3.2c0 .31.21.67.8.55 4.56-1.53 7.85-5.84 7.85-10.92C23.5 5.66 18.34.5 12 .5Z" fill="#181717"/>
      </svg>
    ),
  },
  {
    id: "linkedin_oidc",
    label: "LinkedIn",
    free: true,
    hint: "Sign in with LinkedIn. Pulls your verified email, name, and avatar.",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.65-1.86 3.4-1.86 3.64 0 4.31 2.4 4.31 5.51v6.24ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z"/>
      </svg>
    ),
  },
  {
    id: "apple",
    label: "Apple",
    free: false,
    comingSoon: true,
    hint: "Coming soon.",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path fill="#000" d="M16.36 12.3c-.02-2.27 1.85-3.36 1.94-3.41-1.06-1.55-2.7-1.76-3.29-1.78-1.4-.14-2.74.83-3.45.83-.72 0-1.81-.81-2.98-.78-1.53.02-2.95.89-3.74 2.27-1.6 2.78-.41 6.88 1.14 9.13.76 1.1 1.66 2.34 2.83 2.3 1.13-.05 1.56-.73 2.93-.73 1.36 0 1.74.73 2.93.71 1.21-.02 1.97-1.12 2.71-2.23.85-1.28 1.2-2.51 1.21-2.58-.03-.01-2.32-.89-2.34-3.53Zm-2.27-6.49c.62-.76 1.05-1.81.93-2.86-.9.04-1.99.6-2.64 1.36-.58.67-1.09 1.74-.95 2.77 1 .08 2.03-.51 2.66-1.27Z"/>
      </svg>
    ),
  },
];

const FRIENDLY_PROVIDER: Record<string, string> = {
  google:        "Google",
  github:        "GitHub",
  linkedin_oidc: "LinkedIn",
  apple:         "Apple",
  email:         "Email",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function LinkedAccountsPage() {
  const supabase = createClient();
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState<ProviderId | null>(null);
  const [msg, setMsg]               = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadIdentities = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setIdentities(data?.identities ?? []);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      await loadIdentities();
      setLoading(false);
    })();
  }, [loadIdentities]);

  const isLinked = (id: ProviderId) =>
    identities.some(i => i.provider === id);

  const linkedAt = (id: ProviderId) => {
    const ident = identities.find(i => i.provider === id);
    return ident?.created_at ?? null;
  };

  // Email identity (always present for email/password users)
  const hasEmailIdentity = identities.some(i => i.provider === "email");
  const totalCount = identities.length;

  async function handleConnect(provider: ProviderId) {
    setBusy(provider);
    setMsg(null);
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings/linked-accounts`,
        },
      });
      if (error) throw error;
      // OAuth flow redirects — user returns here after success
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start linking";
      setMsg({ kind: "err", text: `${provider}: ${msg}` });
      setBusy(null);
    }
  }

  async function handleDisconnect(provider: ProviderId) {
    if (totalCount <= 1) {
      setMsg({ kind: "err", text: "You must keep at least one sign-in method linked." });
      return;
    }
    if ((provider as string) === "email" && !hasEmailIdentity) {
      // shouldn't happen, defensive
      return;
    }
    if (!confirm(`Disconnect ${FRIENDLY_PROVIDER[provider] ?? provider}? You'll no longer be able to sign in with it.`)) {
      return;
    }
    setBusy(provider);
    setMsg(null);
    try {
      const ident = identities.find(i => i.provider === provider);
      if (!ident) throw new Error("Identity not found");
      const { error } = await supabase.auth.unlinkIdentity(ident);
      if (error) throw error;
      await loadIdentities();
      setMsg({ kind: "ok", text: `Disconnected ${FRIENDLY_PROVIDER[provider] ?? provider}.` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Disconnect failed" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading linked accounts…</p>;
  }

  function fmt(s: string | null): string {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" }); }
    catch { return "—"; }
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Linked Accounts</h1>
      <p className="mb-6 text-sm text-gray-500">
        Sign in faster by linking your other accounts. We pull your verified email and basic profile only — never any private data.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm border ${
          msg.kind === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {/* Email identity (read-only — always present) */}
        {hasEmailIdentity && (
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 text-base font-semibold">@</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900">Email & password</div>
              <div className="text-xs text-gray-500">Always linked — used for password reset and recovery.</div>
            </div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Connected</span>
          </div>
        )}

        {PROVIDERS.map(p => {
          const linked = isLinked(p.id);
          const isBusy = busy === p.id;
          const isComing = p.comingSoon;

          return (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{p.label}</span>
                  {isComing && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Coming Soon
                    </span>
                  )}
                  {linked && (
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Connected
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{p.hint}</div>
                {linked && (
                  <div className="text-[11px] text-gray-400 mt-0.5">Linked {fmt(linkedAt(p.id))}</div>
                )}
              </div>
              <div>
                {isComing ? (
                  <button type="button" disabled
                    className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400 cursor-not-allowed">
                    Soon
                  </button>
                ) : linked ? (
                  <button type="button"
                    onClick={() => void handleDisconnect(p.id)}
                    disabled={isBusy || totalCount <= 1}
                    title={totalCount <= 1 ? "You must keep at least one sign-in method linked" : ""}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {isBusy ? "Disconnecting…" : "Disconnect"}
                  </button>
                ) : (
                  <button type="button"
                    onClick={() => void handleConnect(p.id)}
                    disabled={isBusy}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {isBusy ? "Opening…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Linked accounts only let you sign in faster — they do not give us access to anything beyond the verified email and basic profile shown above.
      </p>
    </>
  );
}
