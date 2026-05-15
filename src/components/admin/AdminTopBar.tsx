"use client";

/**
 * Sprint 4 W4 (layout parity) — Admin Top Bar.
 *
 * Visually identical to AppTopBar (same 72px height, same logo, same right-side
 * avatar+name+Settings+Sign-out cluster) so the admin view stays inside the
 * job-seeker visual system. The ONLY admin-specific affordance is a centered
 * "Admin Mode" pill + role badge in the middle of the bar — both in red —
 * positioned absolutely so it stays centered regardless of left/right widths.
 *
 * We intentionally keep this as its own component rather than parameterizing
 * AppTopBar, because the admin route is server-side gated and we don't want
 * any code path where a non-admin route accidentally renders an "Admin Mode"
 * banner.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Logo } from "@/components/brand/Logo";
import type { AdminRole } from "@/lib/admin/permissions";

const ROLE_DISPLAY: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin:       "Admin",
  support_l2:  "Support L2",
  support_l1:  "Support L1",
  viewer:      "Viewer",
};

interface AdminTopBarProps {
  adminRole:   AdminRole;
  onMenuClick: () => void;
}

export function AdminTopBar({ adminRole, onMenuClick }: AdminTopBarProps) {
  const [scrolled,    setScrolled]    = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(null);
  const [initials,    setInitials]    = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      const name: string =
        profile?.full_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        user.email?.split("@")[0] ||
        "";
      const avatar: string | null =
        profile?.avatar_url ||
        user.user_metadata?.avatar_url ||
        null;

      setDisplayName(name);
      setAvatarUrl(avatar);

      const parts = name.split(/\s+/).filter(Boolean);
      setInitials(
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase(),
      );
    }
    void loadProfile();

    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail.url;
      setAvatarUrl(url);
    }
    window.addEventListener("icareeros:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("icareeros:avatar-updated", onAvatarUpdated);
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  return (
    <header
      className="icareeros-topbar"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 200,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--neutral-300)",
        boxShadow: scrolled
          ? "0 2px 16px rgba(0,0,0,0.08)"
          : "0 1px 6px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.3s",
        height: "72px",
        display: "flex",
        alignItems: "center",
        padding: "0 1.25rem",
        gap: "1rem",
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="md:hidden rounded-md p-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12h18 M3 6h18 M3 18h18" />
        </svg>
      </button>

      {/* Logo — matches AppTopBar exactly */}
      <a
        href="/dashboard"
        style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
        aria-label="iCareerOS — go to dashboard"
      >
        <Logo variant="horizontal" width={280} ariaLabel="iCareerOS" />
      </a>

      {/* Centered admin indicator — the ONE admin-specific affordance.
          Absolute positioning so it stays mathematically centered even when
          left (logo) and right (avatar + name) clusters are different widths. */}
      <div
        aria-label="Admin mode indicator"
        className="hidden sm:flex items-center gap-2 pointer-events-none"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          whiteSpace: "nowrap",
        }}
      >
        <span
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(220, 38, 38, 0.10)",
            color: "rgb(185, 28, 28)",
            border: "1px solid rgba(220, 38, 38, 0.30)",
          }}
        >
          <span aria-hidden="true">⚠</span> Admin Mode
        </span>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            background: "rgb(220, 38, 38)",
            color: "white",
            letterSpacing: "0.04em",
          }}
          title={`Admin role: ${adminRole}`}
        >
          {ROLE_DISPLAY[adminRole]}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right cluster — identical to AppTopBar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {displayName && (
          <div className="hidden sm:flex items-center gap-2" style={{ marginRight: "0.25rem" }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                width={30} height={30}
                style={{
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1.5px solid var(--neutral-200)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: "#fff",
                  letterSpacing: "0.02em", userSelect: "none",
                }}
              >
                {initials}
              </div>
            )}
            <span style={{
              fontSize: "0.85rem",
              color: "var(--neutral-800)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}>
              {displayName}
            </span>
          </div>
        )}

        {displayName && (
          <span
            className="hidden sm:inline"
            style={{
              width: 1, height: 16,
              background: "var(--neutral-300)",
              display: "inline-block",
              margin: "0 0.25rem",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
        )}

        <a
          href="/settings"
          style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            fontSize: "0.82rem", fontWeight: 600,
            color: "var(--neutral-600)",
            textDecoration: "none",
            padding: "0.35rem 0.65rem",
            borderRadius: "8px",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = "var(--neutral-100)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--neutral-600)";
          }}
          aria-label="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="hidden md:inline">Settings</span>
        </a>

        <button
          onClick={signOut}
          style={{
            border: "1.5px solid var(--neutral-300)",
            background: "transparent",
            color: "var(--neutral-700)",
            padding: "0.4rem 1rem",
            borderRadius: "50px",
            fontWeight: 600,
            fontSize: "0.82rem",
            cursor: "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--primary)";
            el.style.color = "var(--primary)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--neutral-300)";
            el.style.color = "var(--neutral-700)";
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
