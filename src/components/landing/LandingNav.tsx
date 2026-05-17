"use client";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Phase 1 subdomain (2026-05-16) — subtle audience switcher pinned
  // to the right of the section anchors. Each links to the relevant
  // signup with role pre-selected.
  const NAV_LINKS = [
    ["#lifecycle", "The Journey"],
    ["#features",  "Features"],
    ["#stats",     "Impact"],
    ["/auth/signup?role=job_seeker", "For job seekers"],
    ["/auth/signup?role=employer",   "For hiring teams"],
  ];

  return (
    <nav style={{
      background: "var(--surface-page)",
      borderBottom: "1px solid var(--surface-border)",
      position: "sticky", top: 0, zIndex: 100,
      boxShadow: scrolled ? "0 2px 12px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.3s",
    }}>
      {/* Main bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1.25rem 1.5rem",
        maxWidth: "1200px", margin: "0 auto",
      }}>
        {/* Logo */}
        <a href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} aria-label="iCareerOS — home">
          <Logo variant="horizontal" width={280} ariaLabel="iCareerOS" />
        </a>

        {/* Desktop nav — `hidden lg:flex` keeps everything but logo +
            auth buttons off-screen below 1024px so nothing wraps. */}
        <ul
          className="hidden lg:flex list-none m-0 p-0 items-center gap-8"
        >
          {/* Section anchors + audience switcher.
              text-sm + font-normal + whitespace-nowrap so the labels
              never break onto two lines and stay clearly subordinate
              to the iCareerOS wordmark on the left. */}
          {NAV_LINKS.map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="text-sm font-normal whitespace-nowrap text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors no-underline"
              >
                {label}
              </a>
            </li>
          ))}

          {/* Sign In — same text-sm so it visually matches the nav links. */}
          <li>
            <a
              href="/auth/login"
              className="inline-block text-sm font-medium no-underline rounded-full transition-colors whitespace-nowrap"
              style={{
                border: "2px solid var(--primary)",
                color: "var(--primary)",
                background: "transparent",
                padding: "0.5rem 1.1rem",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "var(--primary)";
                el.style.color = "var(--neutral-100)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "transparent";
                el.style.color = "var(--primary)";
              }}
            >
              Sign In
            </a>
          </li>

          {/* Start Free — keep teal fill, reduce typography to text-sm
              font-medium so it doesn't dominate. */}
          <li>
            <a
              href="/auth/signup"
              className="inline-block text-sm font-medium no-underline rounded-full whitespace-nowrap transition-all"
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
                color: "var(--neutral-100)",
                padding: "0.55rem 1.3rem",
                boxShadow: "0 4px 15px rgba(0,217,255,0.2)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(0,217,255,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 15px rgba(0,217,255,0.2)";
              }}
            >
              Start Free
            </a>
          </li>

          <li>
            {/* Theme toggle — pinned right of Start Free (Amir 2026-05-11). */}
            <ThemeToggle compact />
          </li>
        </ul>

        {/* Below lg (1024px): logo + Sign In + hamburger only.
            flex lg:hidden inverts the desktop nav's hidden lg:flex. */}
        <div className="flex lg:hidden items-center gap-3">
          <a
            href="/auth/login"
            className="inline-block text-sm font-medium no-underline rounded-full transition-colors whitespace-nowrap"
            style={{
              border: "2px solid var(--primary)",
              color: "var(--primary)",
              background: "transparent",
              padding: "0.45rem 1rem",
            }}
          >
            Sign In
          </a>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0.4rem", color: "var(--text-secondary)",
            }}
          >
            {menuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={{
          borderTop: "1px solid var(--surface-border)",
          background: "var(--surface-page)",
          padding: "1rem 1.5rem 1.5rem",
        }} className="nav-mobile-menu">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0" }}>
            {NAV_LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={() => setMenuOpen(false)} style={{
                  display: "block", padding: "0.85rem 0",
                  borderBottom: "1px solid var(--surface-border)",
                  textDecoration: "none", color: "var(--text-secondary)",
                  fontWeight: 500, fontSize: "1rem",
                }}>{label}</a>
              </li>
            ))}
            <li style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
              <ThemeToggle />
            </li>
            <li style={{ marginTop: "1rem" }}>
              <a href="/auth/signup" onClick={() => setMenuOpen(false)} style={{
                display: "block", textAlign: "center",
                background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
                color: "var(--neutral-100)", padding: "0.85rem", borderRadius: "50px",
                fontWeight: 600, textDecoration: "none",
              }}>Start Free</a>
            </li>
          </ul>
        </div>
      )}

      {/* Responsive visibility owned by Tailwind: `hidden lg:flex` on
          the desktop nav and `flex lg:hidden` on the mobile controls
          flip at the 1024px breakpoint (Tailwind's `lg`). The legacy
          `<style>` block + class-name CSS is no longer needed. */}
    </nav>
  );
}
