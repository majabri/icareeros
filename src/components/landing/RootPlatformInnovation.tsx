"use client";
import { IconUser, IconBuilding } from "@tabler/icons-react";
import { BRAND_COLORS, ICON_CONTAINER } from "@/lib/design-tokens";

/**
 * RootPlatformInnovation — #platform section on icareeros.com.
 *
 * v3 2026-06-23 (feat/platform-root-landing-v3) — substantial expansion.
 * The thin 2-column outbound overview from PR #302 / #328 is replaced
 * with a richer two-card layout that names every stage of each loop.
 * The platform section now justifies its own named slot in the page.
 */

// ── Stage data ───────────────────────────────────────────────────────
const JOB_SEEKER_STAGES: Array<[string, string, string]> = [
  ["01", "Evaluate", "Skills assessment and honest market fit baseline"],
  ["02", "Advise",   "Resume analysis, fit scores, AI coaching"],
  ["03", "Learn",    "Skill-building paths from your actual gaps"],
  ["04", "Act",      "Tailored applications, pipeline tracking, outreach"],
  ["05", "Achieve",  "Offer management and reset for the next goal"],
];

const HIRING_TEAM_STAGES: Array<[string, string, string]> = [
  ["01", "Design",    "Define the role and score candidates before outreach"],
  ["02", "Select",    "Search verified, opt-in talent by fit"],
  ["03", "Integrate", "Onboarding templates and check-ins"],
  ["04", "Support",   "Engagement tracking and early signals"],
  ["05", "Develop",   "Career pathing and skill development"],
  ["06", "Retain",    "Retention risk scoring and long-term planning"],
];

// ── Section ───────────────────────────────────────────────────────────
export function RootPlatformInnovation() {
  return (
    <section
      id="platform"
      className="landing-fade-bg"
      style={{
        padding: "4rem 3rem",
        background: "var(--neutral-100)",
        scrollMarginTop: "72px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Heading + subheading */}
        <div style={{ textAlign: "center", marginBottom: "3rem", maxWidth: 780, marginLeft: "auto", marginRight: "auto" }}>
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
            marginBottom: "1.25rem",
            color: "var(--neutral-900)",
            lineHeight: 1.2,
          }}>
            Two loops. One platform. Both connected.
          </h2>
          <p style={{
            fontSize: "1.15rem",
            color: "var(--neutral-700)",
            margin: "0 auto",
            lineHeight: 1.7,
          }}>
            Pick the side that&rsquo;s yours. Both loops run on the
            same platform — and connect when a hiring team reaches out
            to a job seeker who&rsquo;s ready.
          </p>
        </div>

        {/* Two-card detail layout */}
        <div className="root-overview-grid" style={{ display: "grid", gap: "1.75rem" }}>
          <LoopCard
            href="https://jobs.icareeros.com"
            icon={<IconUser size={24} strokeWidth={1.5} color={BRAND_COLORS.teal} />}
            eyebrow="For job seekers"
            heading="The career OS"
            body="A five-stage loop that runs from where you are today to where you want to be."
            stages={JOB_SEEKER_STAGES}
            ariaLabelStages="Five career-loop stages"
          />
          <LoopCard
            href="https://hire.icareeros.com"
            icon={<IconBuilding size={24} strokeWidth={1.5} color={BRAND_COLORS.teal} />}
            eyebrow="For hiring teams"
            heading="The hiring OS"
            body="A six-stage retention pathway from role design to long-term retention."
            stages={HIRING_TEAM_STAGES}
            ariaLabelStages="Six hiring-loop stages"
          />
        </div>
      </div>

      <style>{`
        .root-overview-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .root-overview-card { transition: transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease; }
        .root-overview-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
          border-color: ${BRAND_COLORS.teal};
        }
        .root-overview-cta:hover { text-decoration: underline; }
      `}</style>
    </section>
  );
}

// ── LoopCard ─────────────────────────────────────────────────────────
interface LoopCardProps {
  href:            string;
  icon:            React.ReactNode;
  eyebrow:         string;
  heading:         string;
  body:            string;
  stages:          Array<[string, string, string]>;
  ariaLabelStages: string;
}

function LoopCard({ href, icon, eyebrow, heading, body, stages, ariaLabelStages }: LoopCardProps) {
  return (
    <div
      className="root-overview-card"
      style={{
        background: "var(--neutral-100)",
        padding: "2.5rem 2.25rem",
        borderRadius: "1.25rem",
        border: "1px solid var(--neutral-300)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* Icon container */}
      <div style={{
        width: 56,
        height: 56,
        background: ICON_CONTAINER.background,
        borderRadius: "0.85rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {icon}
      </div>

      {/* Eyebrow */}
      <div style={{
        color: BRAND_COLORS.teal,
        fontWeight: 700,
        fontSize: "0.78rem",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
      }}>
        {eyebrow}
      </div>

      {/* Heading + body */}
      <div>
        <h3 style={{
          fontSize: "1.4rem",
          fontWeight: 700,
          marginBottom: "0.65rem",
          color: "var(--neutral-900)",
        }}>
          {heading}
        </h3>
        <p style={{
          color: "var(--neutral-700)",
          fontSize: "1.02rem",
          lineHeight: 1.65,
        }}>
          {body}
        </p>
      </div>

      {/* Stage list */}
      <ul
        aria-label={ariaLabelStages}
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
        }}
      >
        {stages.map(([num, name, blurb]) => (
          <li key={num} style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
            <span style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.78rem",
              color: "var(--neutral-500, #94a3b8)",
              fontWeight: 600,
              flexShrink: 0,
              minWidth: "1.8rem",
            }}>
              {num}
            </span>
            <span style={{ fontSize: "0.97rem", color: "var(--neutral-800)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--neutral-900)", fontWeight: 600 }}>{name}</strong>
              <span style={{ color: "var(--neutral-600)" }}> — {blurb}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* Teal text CTA link */}
      <a
        href={href}
        className="root-overview-cta"
        style={{
          color: BRAND_COLORS.teal,
          fontWeight: 600,
          fontSize: "1rem",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          marginTop: "auto",
        }}
      >
        See how it works →
      </a>
    </div>
  );
}
