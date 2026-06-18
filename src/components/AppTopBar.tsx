"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Logo } from "@/components/brand/Logo";

interface Props {
  onMenuClick?: () => void;
  /** Small muted text rendered next to the logo. Set per platform via PlatformShell config. */
  tagline?: string;
}

/**
 * Persistent top bar.
 *
 * 2026-06-18 (feat/jobs-user-avatar-menu): the previous right-side cluster
 * (avatar + name + Settings link + Sign out button as separate controls)
 * was collapsed into a single clickable avatar/name button that opens a
 * dropdown with Career Profile / Settings / Sign out. Closes on outside
 * click or Escape; teal ring on the avatar when open.
 *
 * Name priority: user_profiles.full_name → user_metadata.full_name → email prefix
 * Avatar priority: user_metadata.avatar_url (OAuth) → initials circle (fallback)
 */
export function AppTopBar({ onMenuClick, tagline }: Props) {
  const [scrolled,     setScrolled]     = useState(false);
  const [displayName,  setDisplayName]  = useState("");
  const [email,        setEmail]        = useState("");
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null);
  const [initials,     setInitials]     = useState("");
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [hovered,      setHovered]      = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      // Name + avatar from user_profiles (resume-sourced, most accurate)
      // Fall back to OAuth user_metadata for avatar, email prefix for name
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
      setEmail(user.email ?? "");
      setAvatarUrl(avatar);

      // Initials for fallback circle
      const parts = name.split(/\s+/).filter(Boolean);
      setInitials(
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase()
      );
    }

    void loadProfile();

    // Live-update when user uploads a new photo on the profile page
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail.url;
      setAvatarUrl(url);
    }
    window.addEventListener("icareeros:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("icareeros:avatar-updated", onAvatarUpdated);
  }, []);

  // ── Dropdown: outside-click + Escape ───────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const root = menuRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function signOut() {
    setMenuOpen(false);
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  // ── Avatar element (used in trigger + dropdown header) ─────────────────────
  const renderAvatar = (size: number) =>
    avatarUrl ? (
      <img
        src={avatarUrl}
        alt={displayName}
        width={size}
        height={size}
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
          width: size, height: size,
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontSize: size >= 40 ? "0.95rem" : "0.7rem",
          fontWeight: 700, color: "#fff",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        {initials}
      </div>
    );

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
        style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
        aria-label="iCareerOS — go to dashboard"
      >
        <Logo variant="horizontal" width={280} ariaLabel="iCareerOS" />
      </a>

      {tagline && (
        <span
          aria-hidden
          className="hidden md:inline"
          style={{
            fontSize:      "0.78rem",
            fontWeight:    500,
            color:         "var(--neutral-500)",
            letterSpacing: "0.01em",
            paddingLeft:   "0.4rem",
            borderLeft:    "1px solid var(--neutral-200)",
            marginLeft:    "0.4rem",
          }}
        >
          {tagline}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right side — clickable avatar/name button + dropdown */}
      {displayName && (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="User menu"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem 0.5rem 0.25rem 0.25rem",
              borderRadius: "999px",
              outline: menuOpen ? "2px solid #00B8A9" : "2px solid transparent",
              outlineOffset: "2px",
              transition: "outline-color 0.15s, background 0.15s",
            }}
          >
            {renderAvatar(30)}
            <span
              className="hidden sm:inline"
              style={{
                fontSize: "0.85rem",
                color: "var(--neutral-800)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </span>
            {/* Caret */}
            <svg
              className="hidden sm:inline"
              width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="var(--neutral-500)"
              strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: menuOpen ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.15s",
                marginLeft: "2px",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div
              role="menu"
              aria-label="User menu"
              className="icareeros-user-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                minWidth: "260px",
                maxWidth: "340px",
                background: "#162338",
                border: "1px solid #1F2E48",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
                padding: "0",
                overflow: "hidden",
                zIndex: 250,
              }}
            >
              {/* Header — non-clickable */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 16px",
                }}
              >
                {renderAvatar(40)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      color: "#FFFFFF",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {displayName}
                  </p>
                  {email && (
                    <p
                      style={{
                        margin: "2px 0 0",
                        color: "#7B9AC0",
                        fontSize: "0.78rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {email}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ height: 1, background: "#1F2E48" }} />

              {/* Menu items */}
              <a
                href="/careerprofile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                onMouseEnter={() => setHovered("profile")}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "11px 16px",
                  fontSize: "0.86rem",
                  color: "#E5EAF2",
                  textDecoration: "none",
                  borderLeft: hovered === "profile" ? "3px solid #00B8A9" : "3px solid transparent",
                  background: hovered === "profile" ? "rgba(0,184,169,0.07)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Career Profile</span>
              </a>

              <a
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                onMouseEnter={() => setHovered("settings")}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "11px 16px",
                  fontSize: "0.86rem",
                  color: "#E5EAF2",
                  textDecoration: "none",
                  borderLeft: hovered === "settings" ? "3px solid #00B8A9" : "3px solid transparent",
                  background: hovered === "settings" ? "rgba(0,184,169,0.07)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </a>

              <div style={{ height: 1, background: "#1F2E48" }} />

              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                onMouseEnter={() => setHovered("signout")}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "11px 16px",
                  fontSize: "0.86rem",
                  color: "#E5EAF2",
                  background: hovered === "signout" ? "rgba(0,184,169,0.07)" : "transparent",
                  border: "none",
                  borderLeft: hovered === "signout" ? "3px solid #00B8A9" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  font: "inherit",
                  fontFamily: "inherit",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
