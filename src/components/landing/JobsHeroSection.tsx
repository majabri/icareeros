"use client";

/**
 * JobsHeroSection — jobs.icareeros.com hero.
 *
 * Job-seeker-only copy per COWORK-BRIEF-platform-landing-v1.md Task 2.
 * Single primary CTA (Start your career OS →) routes to the centralised
 * signup on icareeros.com with role=job_seeker prefilled.
 */
export function JobsHeroSection() {
  return (
    <section style={{
      position: "relative", padding: "6rem 1.5rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 900, position: "relative", zIndex: 2 }}>
        <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          The AI-powered career platform
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.2, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          Your career OS. Six stages.<br/>Real outcomes.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:680, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          A continuous career operating system that runs from Evaluate
          to Achieve — looping until you land your next milestone.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="https://icareeros.com/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your career OS →
          </a>
        </div>
      </div>
    </section>
  );
}
