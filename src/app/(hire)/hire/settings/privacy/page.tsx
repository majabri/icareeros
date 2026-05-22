"use client";

/**
 * /settings/privacy on hire.icareeros.com — recruiter-facing
 * privacy & discoverability controls.
 *
 * Per CP1 routing decision (2026-05-22 strategy-chat Option 1): the
 * source-of-truth column is `career_profiles.is_discoverable` — the
 * same column the jobs.* (app)/settings/privacy page already writes
 * to. Both subdomains writing the same flag through the same column
 * is the only way the candidate-search filter on hire.* stays
 * consistent with the user's privacy choice on jobs.*. No
 * Supabase migration is needed (column already exists per the
 * candidate-search read path at src/app/api/hire/candidates/route.ts
 * and the jobs.* privacy page).
 *
 * Pattern mirrored from src/app/(app)/settings/privacy/page.tsx
 * exactly — same optimistic autosave + revert-on-error + "Saved ✓"
 * pulse. The blocked-employers section is read-only display for
 * this brief; unblock action wires in Sprint H3.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { SettingsNav } from "@/components/hire/SettingsNav";
import { BRAND_COLORS } from "@/lib/design-tokens";

export default function HirePrivacySettingsPage() {
  const supabase = createClient();

  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [savedAt, setSavedAt]                 = useState<number | null>(null);
  const [isDiscoverable, setIsDiscoverable]   = useState(true); // default true per brief
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([]);

  // Load current settings on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }
      const { data, error: readErr } = await supabase
        .from("career_profiles")
        .select("is_discoverable, blocked_companies")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (readErr) {
        setError(readErr.message);
        setLoading(false);
        return;
      }
      // Default true when there's no row yet OR the column is null.
      setIsDiscoverable(data?.is_discoverable === false ? false : true);
      setBlockedCompanies(
        Array.isArray(data?.blocked_companies) ? data!.blocked_companies : [],
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Saved ✓" pulse helper.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pulseSaved() {
    setSavedAt(Date.now());
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedAt(null), 2000);
  }

  // Persist helper — single source of truth, optimistic UI.
  const persist = useCallback(async (
    patch: { is_discoverable?: boolean; blocked_companies?: string[] },
    revert: () => void,
  ) => {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { revert(); setError("Not signed in."); return; }
    const { error: upErr } = await supabase
      .from("career_profiles")
      .update(patch)
      .eq("user_id", user.id);
    if (upErr) { revert(); setError(upErr.message); return; }
    pulseSaved();
  }, [supabase]);

  async function handleToggle() {
    const next = !isDiscoverable;
    const prev = isDiscoverable;
    setIsDiscoverable(next);
    await persist({ is_discoverable: next }, () => setIsDiscoverable(prev));
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <SettingsNav />
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <SettingsNav />

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)", margin: 0 }}>
          Privacy &amp; Discoverability
        </h1>
        <p style={{ marginTop: "0.4rem", fontSize: "0.9rem", color: "var(--text-muted, #64748B)" }}>
          Control whether hiring teams on iCareerOS can find your profile.
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          marginBottom: "1rem",
          padding: "0.7rem 1rem",
          borderRadius: 8,
          background: `${BRAND_COLORS.coral}1A`,
          color: BRAND_COLORS.coral,
          fontSize: "0.88rem",
        }}>
          ⚠ {error}
        </div>
      )}
      {savedAt && (
        <div role="status" style={{
          marginBottom: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: 8,
          background: `${BRAND_COLORS.green}1A`,
          color: BRAND_COLORS.green,
          fontSize: "0.85rem",
        }}>
          Saved ✓
        </div>
      )}

      {/* Discoverability toggle */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
        marginBottom: "1rem",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1.5rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)" }}>
              Show my profile to hiring teams
            </h2>
            <p style={{ marginTop: "0.45rem", fontSize: "0.88rem", color: "var(--text-muted, #64748B)", lineHeight: 1.5 }}>
              When enabled, employers on iCareerOS can find your profile and
              send you invitations. You can turn this off at any time.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDiscoverable}
            aria-label="Show my profile to hiring teams"
            onClick={() => void handleToggle()}
            style={{
              position: "relative",
              flexShrink: 0,
              width: 44,
              height: 24,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: isDiscoverable ? BRAND_COLORS.teal : "#CBD5E1",
              transition: "background 120ms ease",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 2,
                left: isDiscoverable ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#FFFFFF",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                transition: "left 120ms ease",
              }}
            />
          </button>
        </div>
      </section>

      {/* Blocked employers — read-only display */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
      }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)" }}>
          Blocked employers
        </h2>
        {blockedCompanies.length === 0 ? (
          <p style={{ marginTop: "0.5rem", fontSize: "0.88rem", color: "var(--text-muted, #64748B)" }}>
            You have not blocked any employers.
          </p>
        ) : (
          <ul style={{ marginTop: "0.75rem", padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
            {blockedCompanies.map((name) => (
              <li
                key={name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.35rem 0.85rem",
                  borderRadius: 999,
                  background: "var(--surface-muted, #F1F5F9)",
                  fontSize: "0.85rem",
                  color: "var(--text-primary, #0F1B2D)",
                  width: "fit-content",
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
        {/* TODO: wire employer unblock action in Sprint H3 */}
      </section>
    </div>
  );
}
