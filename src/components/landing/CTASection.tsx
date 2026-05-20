"use client";
import { IconTarget, IconBuilding } from "@tabler/icons-react";

/**
 * CTASection — Phase 1 subdomain update (2026-05-16).
 *
 * Two-column footer CTA. Left column targets job seekers; right column
 * targets recruiters. Each column links to the relevant signup with
 * the right `?role=` prefilled.
 *
 * Tabler icon refresh (2026-05-19): emoji bullets replaced with
 * outlined Tabler icons in teal-tinted containers.
 */
export function CTASection() {
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
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {/* Job seekers */}
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
          <a href="/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your career OS →
          </a>
        </div>

        {/* Recruiters */}
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
            <IconBuilding size={20} stroke={1.5} color="#00B8A9" />
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Ready to find exceptional talent?
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Search verified candidates, post jobs, analyse JDs with AI.
          </p>
          <a href="/auth/signup?role=employer" className="btn btn-secondary">
            Hire with iCareerOS →
          </a>
        </div>
      </div>
    </section>
  );
}
