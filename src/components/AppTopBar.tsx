"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

interface Props {
  onMenuClick?: () => void;
}

/**
 * Persistent top bar — matches the LandingNav visual style.
 * Sits fixed at the top of every app page above the sidebar + content.
 */
export function AppTopBar({ onMenuClick }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      setUserName(meta?.full_name?.split(" ")[0] ?? data.user?.email?.split("@")[0] ?? "");
    });
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
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

      {/* Logo — matches landing page gradient */}
      <a
        href="/dashboard"
        style={{
          fontSize: "1.35rem",
          fontWeight: 800,
          letterSpacing: "-0.5px",
          textDecoration: "none",
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          flexShrink: 0,
        }}
      >
        iCareerOS
      </a>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right side: user greeting + sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {userName && (
          <span style={{
            fontSize: "0.85rem",
            color: "var(--neutral-700)",
            fontWeight: 500,
          }}
          className="hidden sm:inline"
          >
            Hi, {userName}
          </span>
        )}
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
