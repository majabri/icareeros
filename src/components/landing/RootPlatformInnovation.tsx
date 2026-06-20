"use client";
import { IconUser, IconBuilding } from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";

/**
 * RootPlatformInnovation — #platform section on icareeros.com.
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v2 (2026-06-17):
 *   - Replaces the prior 4-pillar grid + 3-paragraph deep-dive narrative
 *     (PR #271/#279/#290) with a thin two-column outbound overview.
 *   - Each column links OUT to its standalone subdomain landing
 *     (jobs.icareeros.com / hire.icareeros.com), not to in-page anchors.
 *   - Root surface is now a thin front door: depth lives on the
 *     subdomain landings.
 */
export function RootPlatformInnovation() {
  return (
    <section id="platform" className="landing-fade-bg" style={{ padding: "4rem 3rem", background: "var(--neutral-100)", scrollMarginTop: "72px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{
            color: BRAND_COLORS.teal,
            fontWeight: 600,
            fontSize: "0.95rem",
            marginBottom: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            The platform
          </div>
          <h2 style={{
            fontSize: "2.5rem",
            fontWeight: 800,
            marginBottom: "1rem",
            color: "var(--neutral-900)",
            lineHeight: 1.2,
          }}>
            One operating system. Both sides of hiring.
          </h2>
          <p style={{
            fontSize: "1.15rem",
            color: "var(--neutral-700)",
            maxWidth: 720,
            margin: "0 auto",
            lineHeight: 1.7,
          }}>
            iCareerOS runs a continuous six-stage loop for the people
            looking for a role, and a parallel six-stage loop for the
            teams doing the hiring. Pick the side that&rsquo;s yours.
          </p>
        </div>

        {/* Two-column outbound overview */}
        <div className="root-overview-grid" style={{ display: "grid", gap: "1.75rem" }}>

          {/* Left — Job Seekers */}
          <a
            href="https://jobs.icareeros.com"
            className="root-overview-card"
            style={{
              display: "block",
              background: "var(--neutral-100)",
              padding: "2.5rem 2.25rem",
              borderRadius: "1.25rem",
              border: "1px solid var(--neutral-300)",
              textDecoration: "none",
              transition: "transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease",
            }}
          >
            <div style={{
              width: 56, height: 56,
              background: "rgba(0,184,169,0.10)",
              borderRadius: "0.85rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "1.5rem",
            }}>
              <IconUser size={24} stroke={1.5} color={BRAND_COLORS.teal} />
            </div>
            <h3 style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
              color: "var(--neutral-900)",
            }}>
              For job seekers
            </h3>
            <p style={{
              color: "var(--neutral-700)",
              fontSize: "1.02rem",
              lineHeight: 1.65,
              marginBottom: "1.5rem",
            }}>
              A six-stage career OS — from Evaluate to Achieve. Resume
              analysis, fit scores, interview prep, offer management.
              The full loop, continuously running.
            </p>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: BRAND_COLORS.teal,
              fontWeight: 600,
              fontSize: "1rem",
            }}>
              See how it works →
            </span>
          </a>

          {/* Right — Hiring Teams */}
          <a
            href="https://hire.icareeros.com"
            className="root-overview-card"
            style={{
              display: "block",
              background: "var(--neutral-100)",
              padding: "2.5rem 2.25rem",
              borderRadius: "1.25rem",
              border: "1px solid var(--neutral-300)",
              textDecoration: "none",
              transition: "transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease",
            }}
          >
            <div style={{
              width: 56, height: 56,
              background: "rgba(0,184,169,0.10)",
              borderRadius: "0.85rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "1.5rem",
            }}>
              <IconBuilding size={24} stroke={1.5} color={BRAND_COLORS.teal} />
            </div>
            <h3 style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
              color: "var(--neutral-900)",
            }}>
              For hiring teams
            </h3>
            <p style={{
              color: "var(--neutral-700)",
              fontSize: "1.02rem",
              lineHeight: 1.65,
              marginBottom: "1.5rem",
            }}>
              Search verified, opt-in candidates. AI JD analysis.
              Direct invites. A hiring workflow built around
              candidates who chose to be found.
            </p>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: BRAND_COLORS.teal,
              fontWeight: 600,
              fontSize: "1rem",
            }}>
              See how it works →
            </span>
          </a>
        </div>

      </div>

      <style>{`
        .root-overview-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .root-overview-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
          border-color: ${BRAND_COLORS.teal};
        }
      `}</style>
    </section>
  );
}
