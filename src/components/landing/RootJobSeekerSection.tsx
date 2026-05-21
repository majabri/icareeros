"use client";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconBrain, IconChartBar, IconRoute, IconMessages,
  IconFileText, IconScale, IconX,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG, STAGE_COLORS } from "./CareerCycleSVG";
import { useCycleRotation } from "./useCycleRotation";

/**
 * RootJobSeekerSection — #job-seekers section on icareeros.com.
 *
 * The job-seeker side of the intelligent operating system. Pulls the
 * pain → cycle → features → outcome narrative into one rich section,
 * with the cycle's stage highlight + the matching description card
 * breathing in sync (driven by the shared useCycleRotation hook).
 *
 * Stage colors come from STAGE_COLORS — the brand-palette rotation
 * exported by CareerCycleSVG. Each stage card picks up its stage's
 * color for the icon container so the cycle's color story carries
 * through to the cards beside it.
 *
 * Per Amir 2026-05-20.
 */

const STAGES = [
  { n: 1, label: "Evaluate", Icon: IconCompass,
    body: "An honest baseline. Skills, market fit, the gaps you actually have — assessed against the roles you actually want." },
  { n: 2, label: "Advise",   Icon: IconTarget,
    body: "Real fit scores against real JDs. Resume analysis that's specific to the role. Stop guessing where to spend your time." },
  { n: 3, label: "Learn",    Icon: IconBooks,
    body: "A learning path built from your gaps, your target roles, your timeline. Not a course catalogue you have to sort yourself." },
  { n: 4, label: "Act",      Icon: IconSearch,
    body: "AI-drafted applications tailored per role. Tracked pipeline. Outreach templates. Apply with precision, not volume." },
  { n: 5, label: "Coach",    Icon: IconMicrophone,
    body: "Interview prep that knows the role. Negotiation coaching. Offer review. Walk in knowing what to say and what to ask for." },
  { n: 6, label: "Achieve",  Icon: IconTrophy,
    body: "Sign the offer. Capture the milestone. Reset the loop for the next goal — because careers don't stop at one role." },
] as const;

const PAINS = [
  "Rewriting your resume for every application, from scratch",
  "Sending applications into the void — no signal back",
  "No clue which skills are actually holding you back",
  "Interview prep starts the night before, if at all",
  "Offers land without context — fair? not fair? who knows",
  "Then the whole cycle repeats for the next role, just as chaotic",
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconFileText, title: "A resume that actually adapts",
    body: "Your resume isn't static. iJobsOS tailors it per role — keeps what's strong, sharpens what matters for the JD, drops what isn't earning its place." },
  { Icon: IconChartBar, title: "Fit score before you apply",
    body: "See how well you match a role before sinking two hours into the application. Apply where you have a shot." },
  { Icon: IconRoute, title: "A path built from your gaps",
    body: "Skill gaps identified from your actual target roles — not a generic course library. Learn what moves the needle." },
  { Icon: IconBrain, title: "Advice that knows you",
    body: "Not generic 'optimize your headline' tips. Guidance built from your background, your goals, and what the market is paying for right now." },
  { Icon: IconMessages, title: "Interview prep that knows the role",
    body: "Practice with questions built for the specific role and company — not a generic 'tell me about yourself' drill." },
  { Icon: IconScale, title: "Offer context before you sign",
    body: "Salary benchmarks. Negotiation framing. What to ask for and how. Walk in knowing whether what's on the table is fair." },
];

// Per-stage dwell (ms). Stages 1-5 → 2s each. Stage 6 → 5s pause before
// the cycle resets back to stage 1. Per Amir 2026-05-20.
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
        padding: "6rem 3rem",
        background: "linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Heading block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ color: "#00B8A9", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For job seekers
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            iJobsOS — the intelligent career operating system.
          </h2>
          <p style={{ fontSize: "1.2rem", color: "var(--neutral-900)", maxWidth: 780, margin: "0 auto 0.75rem", lineHeight: 1.5, fontWeight: 600 }}>
            Your career doesn&rsquo;t need more advice. It needs a system.
          </p>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iJobsOS runs a continuous six-stage loop — Evaluate to
            Achieve — handling the mechanics of your job search so you
            can focus on the one thing no AI can do for you: showing up
            and performing.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
            Most job searches feel like this.
          </h3>
          <p style={{ textAlign: "center", color: "var(--neutral-700)", marginBottom: "1.75rem", fontSize: "1rem", lineHeight: 1.6 }}>
            Not because anyone is doing it wrong. Because there&rsquo;s no system.
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
                    color: "#FF6B6B",
                  }}
                >
                  <IconX size={16} stroke={1.5} />
                </span>
                {p}
              </div>
            ))}
          </div>
        </div>

        {/* Cycle SVG + stage detail (synced; per-stage color rotation) */}
        <div className="root-js-cycle-grid" style={{ display: "grid", gap: "2.5rem", alignItems: "start", marginBottom: "4rem" }}>
          <div>
            <CareerCycleSVG
              centerLabel="iJobsOS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
              currentStage={currentStage}
            />
            <div style={{ textAlign:"center", marginTop:"0.5rem", fontSize:"0.85rem", color:"var(--neutral-700)" }}>
              Flashes every 2s · pauses 5s on stage 6 · hover to freeze
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {STAGES.map(({ n, label, Icon: StageIcon, body }, i) => {
              const isActive = i === currentStage;
              const stageColor = STAGE_COLORS[i];
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-pressed={isActive}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "3rem 1fr",
                    gap: "1rem",
                    alignItems: "flex-start",
                    textAlign: "left",
                    background: isActive ? `${stageColor}14` : "var(--neutral-100)",
                    border: `1px solid ${isActive ? stageColor : "var(--neutral-300)"}`,
                    borderRadius: "0.85rem",
                    padding: "1rem 1.25rem",
                    cursor: "pointer",
                    transition: "background 400ms ease, border-color 400ms ease, transform 400ms ease",
                    transform: isActive ? "translateX(4px)" : "translateX(0)",
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{
                    width: 40, height: 40,
                    background: isActive ? stageColor : `${stageColor}1A`,
                    borderRadius: "0.6rem",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 400ms ease",
                  }}>
                    <StageIcon size={20} stroke={1.5} color={isActive ? "#FFFFFF" : stageColor} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: stageColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.15rem" }}>
                      Stage {n} · {label}
                    </div>
                    <div style={{ color: "var(--neutral-800)", fontSize: "0.96rem", lineHeight: 1.55 }}>
                      {body}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "0.5rem" }}>
          Built for the full search.
        </h3>
        <p style={{ textAlign: "center", color: "var(--neutral-700)", marginBottom: "2.5rem", fontSize: "1rem" }}>
          Not just one part of it.
        </p>
        <div className="root-js-features-grid" style={{ display: "grid", gap: "1.5rem" }}>
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
                <FeatureIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.55rem", color: "var(--neutral-900)" }}>{title}</h4>
              <p style={{ color: "var(--neutral-700)", fontSize: "0.97rem", lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .root-js-cycle-grid    { grid-template-columns: 1fr; }
        .root-js-features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .root-js-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 900px) {
          .root-js-cycle-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
        }
        @media (min-width: 1100px) {
          .root-js-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
