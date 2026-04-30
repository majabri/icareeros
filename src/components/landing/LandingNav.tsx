"use client";
import { useEffect, useState } from "react";

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

  const NAV_LINKS = [
    ["#lifecycle", "The Journey"],
    ["#features",  "Features"],
    ["#stats",     "Impact"],
  ];

  return (
    <nav style={{
      background: "var(--neutral-100)",
      borderBottom: "1px solid var(--neutral-300)",
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
        <div style={{
          fontSize: "1.5rem", fontWeight: 800,
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", letterSpacing: "-0.5px",
        }}>iCareerOS</div>

        {/* Desktop nav links */}
        <ul style={{
          display: "flex", listStyle: "none", gap: "2rem",
          alignItems: "center", margin: 0, padding: 0,
        }} className="nav-desktop-links">
          {NAV_LINKS.map(([href, label]) => (
            <li key={href} className="nav-link-item">
              <a href={href} style={{
                textDecoration: "none", color: "var(--neutral-700)",
                fontWeight: 500, fontSize: "0.95rem", transition: "color 0.3s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--neutral-700)")}
              >{label}</a>
            </li>
          ))}
          <li>
            <a href="/auth/login" style={{
              border: "2px solid var(--primary)", color: "var(--primary)",
              background: "transparent", padding: "0.6rem 1.25rem",
              borderRadius: "50px", fontWeight: 600, textDecoration: "none",
              fontSize: "0.9rem", transition: "all 0.3s", display: "inline-block",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "var(--primary)"; el.style.color = "var(--neutral-100)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "transparent"; el.style.color = "var(--primary)";
            }}
            >Sign In</a>
          </li>
          <li>
            <a href="#cta" style={{
              background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
              color: "var(--neutral-100)", padding: "0.7rem 1.5rem", borderRadius: "50px",
              fontWeight: 600, textDecoration: "none", transition: "all 0.3s",
              boxShadow: "0 4px 15px rgba(0,217,255,0.2)", display: "inline-block",
              fontSize: "0.9rem",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(0,217,255,0.3)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 15px rgba(0,217,255,0.2)";
            }}
            >Start Free</a>
          </li>
        </ul>

        {/* Mobile: Sign In + hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
             className="nav-mobile-controls">
          <a href="/auth/login" style={{
            border: "2px solid var(--primary)", color: "var(--primary)",
            background: "transparent", padding: "0.45rem 1rem",
            borderRadius: "50px", fontWeight: 600, textDecoration: "none",
            fontSize: "0.85rem", transition: "all 0.3s", display: "inline-block",
          }}>Sign In</a>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0.4rem", color: "var(--neutral-700)",
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
          borderTop: "1px solid var(--neutral-300)",
          background: "var(--neutral-100)",
          padding: "1rem 1.5rem 1.5rem",
        }} className="nav-mobile-menu">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0" }}>
            {NAV_LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={() => setMenuOpen(false)} style={{
                  display: "block", padding: "0.85rem 0",
                  borderBottom: "1px solid var(--neutral-300)",
                  textDecoration: "none", color: "var(--neutral-700)",
                  fontWeight: 500, fontSize: "1rem",
                }}>{label}</a>
              </li>
            ))}
            <li style={{ marginTop: "1rem" }}>
              <a href="#cta" onClick={() => setMenuOpen(false)} style={{
                display: "block", textAlign: "center",
                background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
                color: "var(--neutral-100)", padding: "0.85rem", borderRadius: "50px",
                fontWeight: 600, textDecoration: "none",
              }}>Start Free</a>
            </li>
          </ul>
        </div>
      )}

      {/* Responsive visibility CSS */}
      <style>{`
        .nav-desktop-links { display: flex !important; }
        .nav-mobile-controls { display: none !important; }
        .nav-mobile-menu { display: block; }
        @media (max-width: 767px) {
          .nav-desktop-links { display: none !important; }
          .nav-mobile-controls { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
