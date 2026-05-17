"use client";

/**
 * HeroSection — Phase 1 subdomain update (2026-05-16).
 *
 * Now addresses both audiences. Primary CTA for job seekers (filled,
 * teal); secondary CTA for recruiters (outlined). Tagline copy + the
 * subhead reflect the dual product. Background particles still come
 * from the global ConstellationBackground, so the section stays
 * transparent.
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
          The AI-powered career platform
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.2, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          For job seekers and the<br/>teams hiring them.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:680, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          On one side: a career operating system that runs on outcomes — six
          stages that loop from Evaluate to Achieve until you land your
          next milestone. On the other: a hiring workflow that finds, scores,
          and reaches verified talent.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="/auth/signup?role=job_seeker" className="btn btn-primary">Start your career OS →</a>
          <a href="/auth/signup?role=employer" className="btn btn-secondary">Hire with iCareerOS →</a>
        </div>
      </div>
    </section>
  );
}
