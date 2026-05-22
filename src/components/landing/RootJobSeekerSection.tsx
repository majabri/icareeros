"use client";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconChartBar, IconRoute, IconMessageCircle,
  IconFileText, IconScale, IconX,
  type Icon,
} from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";
import { CareerCycleSVG, STAGE_COLORS } from "./CareerCycleSVG";
import { useCycleRotation } from "./useCycleRotation";

/**
 * RootJobSeekerSection — #job-seekers section on icareeros.com.
 *
 * Sprint Platform-Closure 2026-05-22:
 *   - Eyebrow: Title Case ("For Job Seekers")
 *   - Six stage CARDS in a 3-column grid (number / icon / headline / body)
 *   - Section heading + subhead + loop caption per brief
 *   - 5 feature cards (was 6)
 *   - Section-end CTA
 *   - Cycle SVG retained above the stage grid as a supporting visual
 */

type Stage = {
  n: number;
  label: string;
  Icon: Icon;
  headline: string;
  body: string;
};

const STAGES: readonly Stage[] = [
  { n: 1, label: "Evaluate", Icon: IconCompass,
    headline: "Where you actually stand",
    body: "Skills assessment, market fit analysis, gap identification. An honest baseline before you make a move." },
  { n: 2, label: "Advise",   Icon: IconTarget,
    headline: "What to do about it",
    body: "Resume analysis against real JDs. Fit scores before you apply. Know which roles are worth your time." },
  { n: 3, label: "Learn",    Icon: IconBooks,
    headline: "Close the gaps that matter",
    body: "Personalised skill-building paths built from your gaps, your target roles, and your timeline." },
  { n: 4, label: "Act",      Icon: IconSearch,
    headline: "Apply with precision, not volume",
    body: "AI-drafted applications tailored per role. Tracked pipeline. Outreach templates. Apply smarter, not more." },
  { n: 5, label: "Coach",    Icon: IconMicrophone,
    headline: "Prepare like you have inside information",
    body: "Role-specific interview prep, negotiation coaching, offer review. Know what to say and what to ask for." },
  { n: 6, label: "Achieve",  Icon: IconTrophy,
    headline: "Land the role. Start the loop again.",
    body: "Offer management, milestone tracking, and a reset for your next goal — because careers don't stop." },
] as const;

const PAINS = [
  "Rewriting your resume for every application, from scratch",
  "Applying into silence — no feedback, no signal",
  "No idea which skills are actually holding you back",
  "Interview prep happens the night before, if at all",
  "Offers arrive with no context on whether they're fair",
  "The cycle repeats for the next role, just as chaotic",
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconFileText, title: "Resume that adapts",
    body: "Your resume isn't static. iCareerOS tailors it to each role — keeping what's strong, adjusting what matters for the JD." },
  { Icon: IconChartBar, title: "Fit score before you apply",
    body: "See how well you match a role before spending two hours on the application. Apply where it counts." },
  { Icon: IconRoute, title: "Your path, not a generic plan",
    body: "Skill gaps identified from your actual target roles — not a course catalogue." },
  { Icon: IconMessageCircle, title: "Interview prep that knows the role",
    body: "Practice with questions built for the specific role and company — not generic drills." },
  { Icon: IconScale, title: "Offer context before you sign",
    body: "Salary benchmarks, negotiation framing, what to ask for and how." },
];

// Per-stage dwell (ms). 2s for stages 1-5, 5s pause on stage 6.
const STAGE_DURATIONS_MS = [2000, 2000, 2000, 2000, 2000, 5000] as const;

export function RootJobSeekerSection() {
  const { current: currentStage, setCurrent, setPaused } = useCycleRotation(
    STAGES.length,
    STAGE_DURATIONS_MS,
  );

  return (
    <section
      id="job-seekers"
      className="landing-fade-bg"
      style={{
        padding: "4rem 3rem",
        background: "linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Heading block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ color: BRAND_COLORS.teal, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For Job Seekers
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            Your career doesn&rsquo;t need more advice. It needs a system.
          </h2>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iCareerOS runs a continuous six-stage loop — from Evaluate
            to Achieve — handling the mechanics of your job search so
            you can focus on the one thing no AI can do for you:
            showing up and performing.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.75rem", color: "var(--neutral-900)", textAlign: "center" }}>
            The way most people job search is broken.
          </h3>
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
            Six stages. One continuous loop. Real outcomes.
          </h3>
          <p style={{ fontSize: "1rem", color: "var(--neutral-700)", maxWidth: 720, margin: "0 auto", lineHeight: 1.65 }}>
            Unlike one-time tools, iCareerOS keeps running — each
            stage feeding the next, until you hit your goal. Then it
            resets for the next one.
          </p>
        </div>

        {/* Supporting cycle SVG above the grid (preserves PR #270-#272 cycle work) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          <CareerCycleSVG
            centerLabel="iCareerOS"
            stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
            currentStage={currentStage}
          />
        </div>

        {/* 3-column stage card grid */}
        <div className="root-js-stage-grid" style={{ display: "grid", gap: "1.25rem", marginBottom: "1.25rem" }}>
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
                  background: isActive ? `${stageColor}10` : "var(--neutral-100)",
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
                {/* Large faded stage number in the corner */}
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
          ↻ After Achieve, the cycle resets — new goal, new gaps, next level.
        </p>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2rem" }}>
          Built for the full search. Not just one part of it.
        </h3>
        <div className="root-js-features-grid" style={{ display: "grid", gap: "1.5rem", marginBottom: "3rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, body }) => (
            <div key={title} style={{
              background: "var(--neutral-100)",
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
            href="https://icareeros.com/auth/signup?role=job_seeker"
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
            Start your career OS — it&rsquo;s free →
          </a>
        </div>
      </div>

      <style>{`
        .root-js-stage-grid    { grid-template-columns: 1fr; }
        .root-js-features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .root-js-stage-grid    { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .root-js-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1100px) {
          .root-js-stage-grid    { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .root-js-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
