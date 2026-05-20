"use client";

/**
 * JobsCTASection — closing CTA on the jobs landing.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 1 — final CTA.
 */
export function JobsCTASection() {
  return (
    <section
      id="cta"
      className="landing-fade-bg"
      style={{
        padding: "6rem 3rem",
        background:
          "linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <h2 style={{ fontSize: "2.25rem", fontWeight: 800, marginBottom: "1rem", color: "var(--neutral-900)" }}>
          Ready to run your career like a system?
        </h2>
        <p style={{ fontSize: "1.1rem", marginBottom: "2.25rem", color: "var(--neutral-700)" }}>
          Free to start. No credit card. Six stages active from day one.
        </p>
        <a
          href="https://icareeros.com/auth/signup?role=job_seeker"
          className="btn btn-primary"
          style={{ fontSize: "1.05rem", padding: "0.85rem 1.75rem" }}
        >
          Start your iJobsOS — it's free →
        </a>
      </div>
    </section>
  );
}
