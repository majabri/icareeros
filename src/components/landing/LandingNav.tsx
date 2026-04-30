"use client";
import { useEffect, useState } from "react";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "1.5rem 3rem",
      background: "var(--neutral-100)",
      borderBottom: "1px solid var(--neutral-300)",
      position: "sticky", top: 0, zIndex: 100,
      boxShadow: scrolled ? "0 2px 12px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.3s",
    }}>
      <div style={{
        fontSize: "1.75rem", fontWeight: 800,
        background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", letterSpacing: "-0.5px",
      }}>iCareerOS</div>

      <ul style={{ display: "flex", listStyle: "none", gap: "2rem", alignItems: "center", margin: 0, padding: 0 }}>
        {[["#lifecycle","The Journey"],["#features","Features"],["#stats","Impact"]].map(([href,label]) => (
          <li key={href}>
            <a href={href} style={{ textDecoration: "none", color: "var(--neutral-700)", fontWeight: 500, fontSize: "0.95rem", transition: "color 0.3s" }}
               onMouseEnter={e => (e.currentTarget.style.color = "var(--primary)")}
               onMouseLeave={e => (e.currentTarget.style.color = "var(--neutral-700)")}>{label}</a>
          </li>
        ))}
        <li>
          <a href="/auth/login" style={{
            border: "2px solid var(--primary)",
            color: "var(--primary)",
            background: "transparent",
            padding: "0.65rem 1.5rem",
            borderRadius: "50px",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: "0.95rem",
            transition: "all 0.3s",
            display: "inline-block",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "var(--primary)";
            el.style.color = "var(--neutral-100)";
            el.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.color = "var(--primary)";
            el.style.transform = "";
          }}
          >Sign In</a>
        </li>
        <li>
          <a href="#cta" style={{
            background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
            color: "var(--neutral-100)", padding: "0.75rem 1.75rem", borderRadius: "50px",
            fontWeight: 600, textDecoration: "none", transition: "all 0.3s",
            boxShadow: "0 4px 15px rgba(0,217,255,0.2)", display: "inline-block",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(0,217,255,0.3)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 15px rgba(0,217,255,0.2)"; }}
          >Start Free</a>
        </li>
      </ul>
    </nav>
  );
}
