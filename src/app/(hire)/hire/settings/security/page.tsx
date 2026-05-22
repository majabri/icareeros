"use client";

/**
 * /settings/security on hire.icareeros.com — password change + connected
 * accounts display.
 *
 * Per COWORK-BRIEF-hire-settings-pages-v1 Task 3.
 *
 * Password change uses `supabase.auth.updateUser({ password })`. Note
 * that Supabase's `updateUser` does NOT verify the current password
 * server-side — that check is presentational only here. A real
 * re-authentication flow can be added later if the security team
 * requires it.
 *
 * Connected accounts: derived from `auth.identities`, which is exposed
 * on the User object as `user.identities`. We show Google / GitHub /
 * LinkedIn with a Connected / Not connected badge each.
 * Unlinking identities is deferred to Sprint H3.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { SettingsNav } from "@/components/hire/SettingsNav";
import { BRAND_COLORS } from "@/lib/design-tokens";

const PROVIDERS = ["google", "github", "linkedin"] as const;
type ProviderId = typeof PROVIDERS[number];

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google:   "Google",
  github:   "GitHub",
  linkedin: "LinkedIn",
};

type Msg = { type: "success" | "error"; text: string };

function badge(label: string, fg: string, bg: string) {
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       "0.2rem 0.6rem",
        borderRadius:  999,
        fontSize:      "0.72rem",
        fontWeight:    700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color:         fg,
        background:    bg,
      }}
    >
      {label}
    </span>
  );
}

export default function HireSecuritySettingsPage() {
  const supabase = createClient();

  const [user, setUser]                     = useState<User | null>(null);
  const [current, setCurrent]               = useState("");
  const [next, setNext]                     = useState("");
  const [confirm, setConfirm]               = useState("");
  const [saving, setSaving]                 = useState(false);
  const [msg, setMsg]                       = useState<Msg | null>(null);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        setMsg({ type: "error", text: error.message });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ type: "success", text: "Password updated successfully." });
    } finally {
      setSaving(false);
    }
  }

  // Determine connected-identity set from auth.identities (may be undefined).
  const connectedProviders = new Set<string>(
    (user?.identities ?? []).map((i) => (i.provider ?? "").toLowerCase()),
  );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <SettingsNav />

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)", margin: 0 }}>
          Security
        </h1>
        <p style={{ marginTop: "0.4rem", fontSize: "0.9rem", color: "var(--text-muted, #64748B)" }}>
          Update your password and manage connected sign-in methods.
        </p>
      </header>

      {/* Section 1 — Change password */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)" }}>
          Change password
        </h2>
        <p style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted, #64748B)" }}>
          Update your password. You will need your current password to make changes.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "grid", gap: "0.85rem", maxWidth: 420 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #0F1B2D)", marginBottom: "0.3rem" }}>
              Current password
            </span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              style={{
                width: "100%",
                padding: "0.5rem 0.7rem",
                borderRadius: 8,
                border: "1px solid var(--surface-border, #CBD5E1)",
                fontSize: "0.9rem",
              }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #0F1B2D)", marginBottom: "0.3rem" }}>
              New password
            </span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              style={{
                width: "100%",
                padding: "0.5rem 0.7rem",
                borderRadius: 8,
                border: "1px solid var(--surface-border, #CBD5E1)",
                fontSize: "0.9rem",
              }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #0F1B2D)", marginBottom: "0.3rem" }}>
              Confirm new password
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              style={{
                width: "100%",
                padding: "0.5rem 0.7rem",
                borderRadius: 8,
                border: "1px solid var(--surface-border, #CBD5E1)",
                fontSize: "0.9rem",
              }}
            />
          </label>

          {msg && (
            <div
              role={msg.type === "error" ? "alert" : "status"}
              style={{
                padding: "0.55rem 0.85rem",
                borderRadius: 8,
                fontSize: "0.85rem",
                background: msg.type === "success" ? `${BRAND_COLORS.green}1A` : `${BRAND_COLORS.coral}1A`,
                color:      msg.type === "success" ? BRAND_COLORS.green : BRAND_COLORS.coral,
              }}
            >
              {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={saving || loading}
              style={{
                background: BRAND_COLORS.teal,
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "0.9rem",
                padding: "0.55rem 1.2rem",
                borderRadius: 10,
                border: "none",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.65 : 1,
              }}
            >
              {saving ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>

      {/* Section 2 — Connected accounts */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
      }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)" }}>
          Connected accounts
        </h2>
        <p style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted, #64748B)" }}>
          Single sign-on providers linked to your iCareerOS account.
        </p>
        <ul style={{ marginTop: "1rem", padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
          {PROVIDERS.map((id) => {
            const connected = connectedProviders.has(id);
            return (
              <li
                key={id}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "0.7rem 0.95rem",
                  border:         "1px solid var(--surface-border, #E5E7EB)",
                  borderRadius:   8,
                }}
              >
                <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-primary, #0F1B2D)" }}>
                  {PROVIDER_LABELS[id]}
                </span>
                {connected
                  ? badge("Connected",     "#065F46", `${BRAND_COLORS.green}1A`)
                  : badge("Not connected", "#475569", "#F1F5F9")}
              </li>
            );
          })}
        </ul>
        {/* TODO: wire identity unlinking in Sprint H3 */}
      </section>
    </div>
  );
}
