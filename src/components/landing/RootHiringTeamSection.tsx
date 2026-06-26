"use client";
import {
  IconRulerMeasure, IconUserSearch, IconUsersPlus, IconHeartHandshake,
  IconTrendingUp, IconShieldCheck,
  IconBrain, IconAdjustments, IconMailForward, IconBuilding, IconRadar, IconX,
  type Icon,
} from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";
import { CareerCycleSVG, STAGE_COLORS } from "./CareerCycleSVG";
import { useCycleRotation } from "./useCycleRotation";

/**
 * RootHiringTeamSection — #hiring-teams section on icareeros.com.
 *
 * Sprint Platform-Closure 2026-05-22:
 *   - Eyebrow: Title Case ("For Hiring Teams")
 *   - Six EMPLOYER-perspective stage cards in a 3-column grid
 *   - Section heading + subhead per brief
 *   - 5 employer feature cards
 *   - Section-end CTA
 *   - Cycle SVG retained above the grid as a supporting visual
 */

type Stage = {
  n: number;
  label: string;
  Icon: Icon;
  headline: string;
  body: string;
};

const STAGES: readonly Stage[] = [
  { n: 1, label: "Design", Icon: IconRulerMeasure,
    headline: "They've already assessed their fit",
    body: "Candidates know their skills, gaps, and market position before they opt in. You're not starting a cold conversation." },
  { n: 2, label: "Select", Icon: IconUserSearch,
    headline: "They've been matched to roles like yours",
    body: "The OS has already scored their fit against job descriptions in your category. They know where they stand." },
  { n: 3, label: "Integrate", Icon: IconUsersPlus,
    headline: "They're actively closing skill gaps",
    body: "The candidates you find are working on the gaps relevant to their target roles — including yours." },
  { n: 4, label: "Support", Icon: IconHeartHandshake,
    headline: "They're applying with precision",
    body: "iCareerOS candidates apply deliberately — tailored applications to roles that match. Less noise in your pipeline. Higher signal per application." },
  { n: 5, label: "Develop", Icon: IconTrendingUp,
    headline: "They've done interview prep for your role",
    body: "Role-specific preparation built into the OS. First conversations are more substantive." },
  { n: 6, label: "Retain", Icon: IconShieldCheck,
    headline: "They know what a fair offer looks like",
    body: "Offer-stage surprises are rarer. Candidates have salary benchmarks and know how to evaluate what's on the table." },
] as const;

const PAINS = [
  "Sourcing lists full of people who haven't looked for a job in years",
  "Messages ignored because candidates aren't actually looking",
  "Screening calls that reveal the resume was a stretch",
  "Offer-stage surprises — salary expectations nowhere near reality",
  "Time-to-fill measured in months, not weeks",
  "AI auto-apply tools mean you're reviewing 10x more applications from candidates who used AI to blast 200 roles — most with no genuine interest in yours specifically",
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconBrain, title: "AI JD Analysis",
    body: "Paste a job description. Get instant fit scoring against your candidate pool before you start reviewing." },
  { Icon: IconShieldCheck, title: "Verified, opt-in candidates",
    body: "Every profile you see belongs to someone who created an account and chose to be found." },
  { Icon: IconAdjustments, title: "Filters that matter",
    body: "Role, location, experience level, remote preference. Filter to candidates who match your actual requirements." },
  { Icon: IconMailForward, title: "Direct in-app invites",
    body: "Reach candidates where they're managing their job search. Track invite status and engagement." },
  { Icon: IconBuilding, title: "Company profile",
    body: "Show candidates who you are before they decide whether to respond. Culture, mission, open roles." },
  { Icon: IconRadar, title: "Candidate readiness signals",
    body: "See where each candidate is in their career OS. A candidate in Act is ready to apply now. One in Learn is a few weeks out. Reach out at the right moment." },
];

const STAGE_DURATIONS_MS = [2000, 2000, 2000, 2000, 2000, 5000] as const;

export function RootHiringTeamSection() {
  const { current: currentStage, setCurrent, setPaused } = useCycleRotation(
    STAGES.length,
    STAGE_DURATIONS_MS,
  );

  return (
    <section
      id="hiring-teams"
      className="landing-fade-bg"
      style={{ padding: "4rem 3rem", background: "var(--neutral-100)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Heading block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ color: BRAND_COLORS.teal, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For Hiring Teams
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            Hire people who chose to be found.
          </h2>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iCareerOS candidates aren&rsquo;t passive. They&rsquo;re
            actively managing their careers — assessing fit, building
            skills, preparing for interviews — and they chose to be
            discoverable. That&rsquo;s a different kind of first
            conversation.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
            Most hiring tools were built for the wrong problem.
          </h3>
          <p style={{ textAlign: "center", color: "var(--neutral-700)", marginBottom: "1.75rem", fontSize: "1rem", lineHeight: 1.6 }}>
            They give you access to more people. You need access to the right ones.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {PAINS.map(p => (
              <div
                key={p}
                style={{
                  fontSize: "1rem",
                  color: "var(--neutral-800)",
                  paddingLeft: "2.5rem",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "0.1rem",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "9999px",
                    background: "rgba(255, 107, 107, 0.12)",
                    color: BRAND_COLORS.coral,
                  }}
                >
                  <IconX size={16} stroke={1.5} />
                </span>
                {p}
              </div>
            ))}
          </div>
        </div>

        {/* Stages — heading + subhead + supporting cycle SVG + 3-column grid */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", marginBottom: "0.6rem" }}>
            What you get on the other side of the loop.
          </h3>
          <p style={{ fontSize: "1rem", color: "var(--neutral-700)", maxWidth: 720, margin: "0 auto", lineHeight: 1.65 }}>
            Every candidate you reach is already working through a
            structured career OS. That&rsquo;s what makes them
            different from everyone else in your inbox.
          </p>
        </div>

        {/* Supporting cycle SVG above the grid */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          <CareerCycleSVG
            centerLabel="iCareerOS"
            stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
            currentStage={currentStage}
          />
        </div>

        {/* 3-column employer stage card grid */}
        <div className="root-ht-stage-grid" style={{ display: "grid", gap: "1.25rem", marginBottom: "1.25rem" }}>
          {STAGES.map(({ n, label, Icon: StageIcon, headline, body }, i) => {
            const isActive = i === currentStage;
            const stageColor = STAGE_COLORS[i];
            const stageNumber = String(n).padStart(2, "0");
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCurrent(i)}
                aria-pressed={isActive}
                style={{
                  position: "relative",
                  background: isActive ? `${stageColor}10` : "var(--surface-card, #ffffff)",
                  border: `1px solid ${isActive ? stageColor : "var(--neutral-300)"}`,
                  borderTop: `3px solid ${stageColor}`,
                  borderRadius: "1rem",
                  padding: "1.6rem 1.4rem 1.4rem",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 400ms ease, border-color 400ms ease, transform 400ms ease",
                  transform: isActive ? "translateY(-2px)" : "translateY(0)",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                <div aria-hidden style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "1rem",
                  fontSize: "3rem",
                  fontWeight: 800,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: `${stageColor}1A`,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  pointerEvents: "none",
                }}>
                  {stageNumber}
                </div>
                <div style={{
                  width: 44, height: 44,
                  background: `${stageColor}1A`,
                  borderRadius: "0.65rem",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "1rem",
                }}>
                  <StageIcon size={20} stroke={1.5} color={stageColor} />
                </div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: stageColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.35rem" }}>
                  Stage {n} · {label}
                </div>
                <h4 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--neutral-900)", marginBottom: "0.5rem", lineHeight: 1.3 }}>
                  {headline}
                </h4>
                <p style={{ fontSize: "0.95rem", color: "var(--neutral-700)", lineHeight: 1.6 }}>
                  {body}
                </p>
              </button>
            );
          })}
        </div>

        {/* Loop caption */}
        <p style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--neutral-700)", marginBottom: "4rem", fontStyle: "italic" }}>
          The loop keeps running — for their next goal, and your next hire.
        </p>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2rem" }}>
          Everything you need. Nothing you don&rsquo;t.
        </h3>
        <div className="root-ht-features-grid" style={{ display: "grid", gap: "1.5rem", marginBottom: "3rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, body }) => (
            <div key={title} style={{
              background: "var(--surface-card, #ffffff)",
              padding: "2rem 1.75rem",
              borderRadius: "1.25rem",
              border: "1px solid var(--neutral-300)",
              textAlign: "left",
            }}>
              <div style={{
                width: 48, height: 48,
                background: "rgba(0,184,169,0.10)",
                borderRadius: "0.75rem",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "1.1rem",
              }}>
                <FeatureIcon size={20} stroke={1.5} color={BRAND_COLORS.teal} />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.55rem", color: "var(--neutral-900)" }}>{title}</h4>
              <p style={{ color: "var(--neutral-700)", fontSize: "0.97rem", lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>

        {/* Section CTA */}
        <div style={{ textAlign: "center" }}>
          <a
            href="https://icareeros.com/auth/signup?role=employer"
            className="btn btn-primary"
            style={{
              display: "inline-block",
              padding: "0.85rem 1.6rem",
              borderRadius: "0.6rem",
              background: BRAND_COLORS.teal,
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start hiring free →
          </a>
        </div>
      </div>

      <style>{`
        .root-ht-stage-grid     { grid-template-columns: 1fr; }
        .root-ht-features-grid  { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .root-ht-stage-grid    { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .root-ht-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1100px) {
          .root-ht-stage-grid    { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .root-ht-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
