"use client";

/**
 * HireHeroSection — hire.icareeros.com hero.
 * Copy per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2.
 */
export function HireHeroSection() {
  return (
    <section style={{
      position: "relative", padding: "6rem 1.5rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 920, position: "relative", zIndex: 2 }}>
        <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          iTalentOS by iCareerOS
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.15, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          Hire people who chose to be found.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:760, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          iCareerOS candidates aren&rsquo;t passive. They&rsquo;re actively
          managing their careers — assessing fit, building skills,
          preparing for interviews — and they&rsquo;ve opted in to be
          discovered. That&rsquo;s a different kind of candidate.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="https://icareeros.com/auth/signup?role=employer" className="btn btn-primary">
            Start hiring free →
          </a>
        </div>
      </div>
    </section>
  );
}
