"use client";

/**
 * RootHeroSection — icareeros.com hero (dual-audience).
 *
 * Hero copy reinforces the intelligent-operating-system frame and the
 * two-sided promise. No in-body CTAs — the top-bar 'Get Started — free →'
 * carries conversion as users scroll.
 *
 * Per Amir 2026-05-20.
 */
export function RootHeroSection() {
  return (
    <section style={{
      position: "relative", padding: "3.5rem 1.5rem 4rem",
      textAlign: "center", minHeight: "60vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 960, position: "relative", zIndex: 2 }}>
        <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          The intelligent career operating system
        </div>

        <h1 style={{ fontSize:"3.75rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.15, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          One operating system.<br/>Both sides of hiring.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:780, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          Two continuous loops — one for job seekers, one for hiring
          teams — running on the same platform. The system works
          because both sides are in it.
        </p>

      </div>
    </section>
  );
}
