"use client";

/**
 * HeroSection — Phase 3 design-system unification (2026-05-11).
 *
 * Previously had its own inline canvas particle animation. Now the global
 * ConstellationBackground (mounted at app/page.tsx + app/(app)/layout.tsx +
 * app/auth/layout.tsx) provides ONE consistent particle layer across every
 * page. The hero is a pure content section — content only, transparent bg.
 */
export function HeroSection() {
  return (
    <section style={{
      position: "relative", padding: "6rem 1.5rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 900, position: "relative", zIndex: 2 }}>
        <div style={{ color:"var(--accent, var(--primary))", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          Career Operating System
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.2, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          The career OS that runs<br/>on outcomes, not advice.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:680, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          Most career tools give you information. iCareerOS gives you a system — six stages that loop from Evaluate to Achieve, built to keep moving until you hit your next milestone.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="#cta" className="btn btn-primary">Start your first cycle →</a>
          <a href="#lifecycle" className="btn btn-secondary">See how it works</a>
        </div>
      </div>
    </section>
  );
}
