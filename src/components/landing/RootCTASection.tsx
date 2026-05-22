"use client";
import { IconUser, IconBuilding } from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";

/**
 * RootCTASection — dual closing CTA on icareeros.com.
 * Sprint Platform-Closure 2026-05-22: Title-Case eyebrows above each
 * card; button labels per brief (no "— it's free" suffix on dual CTA).
 */
export function RootCTASection() {
  return (
    <section
      id="cta"
      className="landing-fade-bg"
      style={{
        padding: "4rem 3rem",
        background:
          "linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)",
      }}
    >
      <div
        className="root-cta-grid"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gap: "1.75rem",
        }}
      >
        {/* Job seekers */}
        <div
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
            el.style.borderColor = BRAND_COLORS.teal;
            el.style.boxShadow = "0 20px 60px rgba(0,184,169,0.15)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "var(--landing-cta-border, var(--neutral-300))";
            el.style.boxShadow = "0 10px 40px rgba(0,184,169,0.10)";
          }}
        >
          <div aria-hidden style={{
            width: 48, height: 48,
            margin: "0 auto 0.75rem",
            background: "rgba(0,184,169,0.10)",
            borderRadius: "0.75rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconUser size={20} stroke={1.5} color={BRAND_COLORS.teal} />
          </div>
          <div style={{ color: BRAND_COLORS.teal, fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.5rem" }}>
            Job Seekers
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Run your career like a system.
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Six stages, AI coaching, continuous loop. Free to start.
          </p>
          <a href="https://icareeros.com/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your career OS →
          </a>
        </div>

        {/* Employers */}
        <div
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
            el.style.borderColor = BRAND_COLORS.teal;
            el.style.boxShadow = "0 20px 60px rgba(0,184,169,0.15)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "var(--landing-cta-border, var(--neutral-300))";
            el.style.boxShadow = "0 10px 40px rgba(0,184,169,0.10)";
          }}
        >
          <div aria-hidden style={{
            width: 48, height: 48,
            margin: "0 auto 0.75rem",
            background: "rgba(0,184,169,0.10)",
            borderRadius: "0.75rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconBuilding size={20} stroke={1.5} color={BRAND_COLORS.teal} />
          </div>
          <div style={{ color: BRAND_COLORS.teal, fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.5rem" }}>
            Hiring Teams
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Hire candidates who are already prepared.
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Verified, opt-in talent. AI JD analysis. Direct invites. Free to start.
          </p>
          <a href="https://icareeros.com/auth/signup?role=employer" className="btn btn-secondary">
            Start hiring free →
          </a>
        </div>
      </div>

      <style>{`
        .root-cta-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-cta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
