"use client";

/**
 * HireHeroSection — hire.icareeros.com hero.
 *
 * Per COWORK-BRIEF-platform-landing-v1.md Task 3. Single CTA routes
 * to the centralised signup on icareeros.com with role=employer.
 */
export function HireHeroSection() {
  return (
    <section style={{
      position: "relative", padding: "6rem 1.5rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 900, position: "relative", zIndex: 2 }}>
        <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          iCareerOS for Hiring
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.2, letterSpacing:"-1px", color:"var(--text-primary)" }}>
          Hire verified talent. Faster.
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--text-muted)", maxWidth:680, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          Search AI-scored candidates who&rsquo;ve opted in to be discovered.
          Analyse job descriptions, send invites, and build your pipeline
          — all in one workflow.
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
