"use client";
import { IconUser, IconBuilding } from "@tabler/icons-react";

/**
 * RootCTASection — dual closing CTA on icareeros.com.
 * Per Amir 2026-05-20 — page-end dual CTA matches the iJobsOS / iTalentOS
 * brand hierarchy locked in PR #267.
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
            el.style.borderColor = "#00B8A9";
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
            <IconUser size={20} stroke={1.5} color="#00B8A9" />
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Run your career like a system.
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Six stages, AI coaching, continuous loop. Free to start.
          </p>
          <a href="https://icareeros.com/auth/signup?role=job_seeker" className="btn btn-primary">
            Start your iJobsOS — it&rsquo;s free →
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
            el.style.borderColor = "#00B8A9";
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
            <IconBuilding size={20} stroke={1.5} color="#00B8A9" />
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem", color: "var(--text-primary, var(--neutral-900))" }}>
            Hire candidates who are already prepared.
          </h2>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "var(--text-secondary, var(--neutral-700))" }}>
            Verified, opt-in talent. AI fit scoring. Direct invites. Free to start.
          </p>
          <a href="https://icareeros.com/auth/signup?role=employer" className="btn btn-secondary">
            Start your iTalentOS — it&rsquo;s free →
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
