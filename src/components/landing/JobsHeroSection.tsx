"use client";

/**
 * JobsHeroSection — jobs.icareeros.com hero.
 *
 * Copy per COWORK-BRIEF-platform-landing-copy-v1.md Surface 1.
 * Brand voice: direct, system-language, no career-coach platitudes.
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
          iJobsOS by iCareerOS
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.15, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          Your career doesn&rsquo;t need more advice.<br/>It needs a system.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:720, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          iCareerOS runs a continuous six-stage loop — from Evaluate to
          Achieve — handling the mechanics of your job search so you can
          focus on the one thing no AI can do for you: showing up and
          performing.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="https://icareeros.com/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your iJobsOS — it&rsquo;s free →
          </a>
        </div>
      </div>
    </section>
  );
}
