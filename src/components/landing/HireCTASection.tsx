"use client";

/**
 * HireCTASection — closing CTA on the hire landing.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2 — final CTA.
 */
export function HireCTASection() {
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
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontSize: "2.25rem", fontWeight: 800, marginBottom: "1rem", color: "var(--neutral-900)" }}>
          Ready to hire candidates who are already prepared?
        </h2>
        <p style={{ fontSize: "1.1rem", marginBottom: "2.25rem", color: "var(--neutral-700)" }}>
          Free to start. No credit card. Search the talent pool from day one.
        </p>
        <a
          href="https://icareeros.com/auth/signup?role=employer"
          className="btn btn-primary"
          style={{ fontSize: "1.05rem", padding: "0.85rem 1.75rem" }}
        >
          Start hiring free →
        </a>
      </div>
    </section>
  );
}
