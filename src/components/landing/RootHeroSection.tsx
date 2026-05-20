"use client";

/**
 * RootHeroSection — icareeros.com hero (dual-audience).
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 3.
 */
export function RootHeroSection() {
  return (
    <section style={{
      position: "relative", padding: "6rem 1.5rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 960, position: "relative", zIndex: 2 }}>
        <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          The career operating system
        </div>

        <h1 style={{ fontSize:"3.75rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.15, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          The career infrastructure<br/>for both sides of hiring.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:780, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          One platform. Two connected experiences. Job seekers run a
          continuous iJobsOS — from evaluation to offer — while hiring
          teams search verified, opt-in talent who are already prepared.
          The system works because both sides are in it.
        </p>

      </div>
    </section>
  );
}
