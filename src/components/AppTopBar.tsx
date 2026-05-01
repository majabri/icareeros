"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

interface Props {
  onMenuClick?: () => void;
}

/**
 * Persistent top bar.
 * Right side: [avatar] [Full Name]  ·  Settings  [Sign out]
 *
 * Name priority: user_profiles.full_name → user_metadata.full_name → email prefix
 * Avatar priority: user_metadata.avatar_url (OAuth) → initials circle (fallback)
 */
export function AppTopBar({ onMenuClick }: Props) {
  const [scrolled,     setScrolled]     = useState(false);
  const [displayName,  setDisplayName]  = useState("");
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null);
  const [initials,     setInitials]     = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      // Avatar — only available for OAuth providers (Google, GitHub, etc.)
      const metaAvatar: string | undefined = user.user_metadata?.avatar_url;
      if (metaAvatar) setAvatarUrl(metaAvatar);

      // Name — prefer user_profiles (resume-sourced), fall back to auth metadata
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const name: string =
        profile?.full_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        user.email?.split("@")[0] ||
        "";

      setDisplayName(name);

      // Initials for fallback avatar
      const parts = name.split(/\s+/).filter(Boolean);
      setInitials(
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase()
      );
    })();
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  return (
    <header
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
        height: "56px",
        display: "flex",
        alignItems: "center",
        padding: "0 1.25rem",
        gap: "1rem",
      }}
    >
      {/* Mobile hamburger */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="md:hidden rounded-md p-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}

      {/* Logo */}
      <a
        href="/dashboard"
        style={{
          fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.5px",
          textDecoration: "none",
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          flexShrink: 0,
        }}
      >
        iCareerOS
      </a>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right side: avatar + name · Settings · Sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>

        {/* Avatar + name — hidden on very small screens */}
        {displayName && (
          <div
            className="hidden sm:flex items-center gap-2"
            style={{ marginRight: "0.25rem" }}
          >
            {/* Avatar: photo if available, else initials circle */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                width={30}
                height={30}
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
                  width: 30, height: 30,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "0.7rem", fontWeight: 700, color: "#fff",
                  letterSpacing: "0.02em",
                  userSelect: "none",
                }}
              >
                {initials}
              </div>
            )}

            {/* Full name */}
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

        {/* Divider */}
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

        {/* Settings link */}
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
          {/* Gear icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="hidden md:inline">Settings</span>
        </a>

        {/* Sign out button */}
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
