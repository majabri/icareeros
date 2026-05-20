"use client";
import { IconTarget } from "@tabler/icons-react";

/**
 * JobsCTASection — jobs.icareeros.com closing CTA.
 *
 * Single-column, job-seeker only. Sister component to CTASection
 * (root, dual-column). The employer "Ready to find exceptional talent?"
 * card is intentionally omitted per COWORK-BRIEF-platform-landing-v1.md
 * Task 2.
 */
export function JobsCTASection() {
  return (
    <section
      id="cta"
      className="landing-fade-bg"
      style={{
        padding: "5rem 3rem",
        background:
          "linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <div
          className="landing-cta-card"
          style={{
            background: "var(--landing-cta-bg, var(--neutral-100))",
            padding: "3rem 2.5rem",
            borderRadius: "2rem",
            border: "2px solid var(--landing-cta-border, var(--neutral-300))",
            boxShadow: "0 10px 40px rgba(0,184,169,0.10)",
            textAlign: "center",
            transition: "all 0.3s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "#00B8A9";
            el.style.boxShadow = "0 20px 60px rgba(0,184,169,0.15)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor =
              "var(--landing-cta-border, var(--neutral-300))";
            el.style.boxShadow = "0 10px 40px rgba(0,184,169,0.10)";
          }}
        >
          <div
            aria-hidden
            style={{
              width: 48, height: 48,
              margin: "0 auto 0.75rem",
              background: "rgba(0,184,169,0.10)",
              borderRadius: "0.75rem",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconTarget size={20} stroke={1.5} color="#00B8A9" />
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Ready to find your next role?
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Six stages, AI coaching, real outcomes. Free to start.
          </p>
          <a href="https://icareeros.com/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your career OS →
          </a>
        </div>
      </div>
    </section>
  );
}
