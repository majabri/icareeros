"use client";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BRAND_COLORS } from "@/lib/design-tokens";

/**
 * HireLandingNav — hire.icareeros.com nav.
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v1 (2026-05-27): jobs.* gets
 * a standalone landing with a "← iCareerOS" back-nav to the root marketing
 * surface. Otherwise mirrors LandingNav's structure (auth links absolute
 * icareeros.com URLs).
 */
export function HireLandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  return (
    <nav style={{
      background: "var(--surface-page)",
      borderBottom: "1px solid var(--surface-border)",
      position: "sticky", top: 0, zIndex: 100,
      boxShadow: scrolled ? "0 2px 12px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.3s",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1.25rem 1.5rem",
        maxWidth: "1200px", margin: "0 auto",
      }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} aria-label="iCareerOS — hire home">
            <Logo variant="horizontal" width={280} ariaLabel="iCareerOS for Hiring Teams" />
          </a>

        <ul className="hidden lg:flex list-none m-0 p-0 items-center gap-8">
          <li>
            <a
              href="https://icareeros.com/auth/login"
              className="inline-block text-sm font-medium no-underline rounded-full transition-colors whitespace-nowrap"
              style={{
                border: "2px solid #00B8A9",
                color: "#00B8A9",
                background: "transparent",
                padding: "0.5rem 1.1rem",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "#00B8A9";
                el.style.color = "var(--neutral-100)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "transparent";
                el.style.color = "#00B8A9";
              }}
            >
              Sign In
            </a>
          </li>
          <li>
            <a
              href="https://icareeros.com/auth/signup?role=employer"
              className="inline-block text-sm font-medium no-underline rounded-full whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg, #00B8A9 0%, #40C9C0 100%)",
                color: "var(--neutral-100)",
                padding: "0.55rem 1.3rem",
                boxShadow: "0 4px 15px rgba(0,184,169,0.20)",
              }}
            >
              Get Started — free →
            </a>
          </li>
          <li><ThemeToggle compact /></li>
        </ul>

        <div className="flex lg:hidden items-center gap-3">
          <a
            href="https://icareeros.com/auth/login"
            className="inline-block text-sm font-medium no-underline rounded-full transition-colors whitespace-nowrap"
            style={{
              border: "2px solid #00B8A9",
              color: "#00B8A9",
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

      {/* Thin secondary row — back-link to root, below the main header line */}
      <div style={{
        borderTop: "1px solid var(--surface-border)",
        padding: "0.45rem 1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}>
        <a
          href="https://icareeros.com"
          style={{
            fontSize: "0.8rem",
            color: BRAND_COLORS.slateBlue,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
          aria-label="Back to iCareerOS root"
        >
          ← iCareerOS
        </a>
      </div>

      {menuOpen && (
        <div style={{
          borderTop: "1px solid var(--surface-border)",
          background: "var(--surface-page)",
          padding: "1rem 1.5rem 1.5rem",
        }} className="nav-mobile-menu">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0" }}>
            <li>
              <a
                href="https://icareeros.com"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "block", padding: "0.85rem 0",
                  borderBottom: "1px solid var(--surface-border)",
                  textDecoration: "none", color: "var(--text-secondary)",
                  fontWeight: 500, fontSize: "1rem",
                }}
              >← iCareerOS</a>
            </li>
            <li style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
              <ThemeToggle />
            </li>
            <li style={{ marginTop: "1rem" }}>
              <a
                href="https://icareeros.com/auth/signup?role=employer"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "block", textAlign: "center",
                  background: "linear-gradient(135deg, #00B8A9 0%, #40C9C0 100%)",
                  color: "var(--neutral-100)", padding: "0.85rem", borderRadius: "50px",
                  fontWeight: 600, textDecoration: "none",
                }}
              >Get Started — free →</a>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}
