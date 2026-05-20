"use client";
import { useEffect, useState } from "react";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconBrain, IconChartBar, IconRoute, IconMessages,
  IconFileText, IconScale, IconX,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG } from "./CareerCycleSVG";

/**
 * RootJobSeekerSection — #job-seekers section on icareeros.com.
 *
 * Rich audience section that consolidates what previously lived across
 * the root #job-seekers section AND the jobs.icareeros.com landing.
 * Structure: hero copy → pain → synced cycle SVG + stage detail →
 * features grid → CTA. The synced cycle is driven by a useState
 * counter that auto-advances every 3s (paused on hover) so the SVG
 * node and the description card breathe in sync.
 *
 * Per Amir 2026-05-20.
 */

const STAGES = [
  { n: 1, label: "Evaluate", Icon: IconCompass,
    body: "Skills assessment, market fit, gap identification. An honest baseline before you make a move." },
  { n: 2, label: "Advise",   Icon: IconTarget,
    body: "Resume analysis against real JDs. Fit scores before you apply. Know which roles are worth your time." },
  { n: 3, label: "Learn",    Icon: IconBooks,
    body: "Personalised skill-building paths built from your gaps, your target roles, and your timeline." },
  { n: 4, label: "Act",      Icon: IconSearch,
    body: "AI-drafted applications tailored per role. Tracked pipeline. Outreach templates. Apply smarter, not more." },
  { n: 5, label: "Coach",    Icon: IconMicrophone,
    body: "Role-specific interview prep, negotiation coaching, offer review. Know what to say and what to ask for." },
  { n: 6, label: "Achieve",  Icon: IconTrophy,
    body: "Offer management, milestone tracking, reset for the next goal. Because careers don't stop." },
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
  { Icon: IconFileText, title: "Resume that adapts to each role",
    body: "Your resume isn't static. iJobsOS tailors it to each role — keeping what's strong, adjusting what matters for the JD." },
  { Icon: IconChartBar, title: "Fit score before you apply",
    body: "See how well you match a role before spending two hours on the application. Apply where it counts." },
  { Icon: IconRoute, title: "Your path, not a generic plan",
    body: "Skill gaps identified from your actual target roles — not a course catalogue. Learn what moves the needle." },
  { Icon: IconBrain, title: "AI-driven advice tailored to you",
    body: "Not generic 'optimise your resume' tips. Specific guidance built from your background, your goals, and the current market." },
  { Icon: IconMessages, title: "Interview prep that knows the role",
    body: "Practice with questions built for the specific role and company — not generic 'tell me about yourself' drills." },
  { Icon: IconScale, title: "Offer context before you sign",
    body: "Salary benchmarks, negotiation framing, what to ask for and how. Know whether what's on the table is fair." },
];

// Per-stage dwell times (ms). Stages 1-5 advance every 2s; stage 6
// dwells for 10s before wrapping back to stage 1. Per Amir 2026-05-20.
const STAGE_DURATIONS_MS = [2000, 2000, 2000, 2000, 2000, 10000];

export function RootJobSeekerSection() {
  const [currentStage, setCurrentStage] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Respect user preference for reduced motion: no auto-advance.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (paused) return;
    // setTimeout (not setInterval) so each stage can have its own dwell —
    // stages 1-5 advance every 2s, stage 6 dwells 10s. The effect re-runs
    // on each currentStage change which restarts the timer with the new
    // stage's duration.
    const id = window.setTimeout(
      () => setCurrentStage(n => (n + 1) % STAGES.length),
      STAGE_DURATIONS_MS[currentStage] ?? 2000,
    );
    return () => window.clearTimeout(id);
  }, [currentStage, paused]);

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
            iJobsOS — the intelligent career OS for job seekers.
          </h2>
          <p style={{ fontSize: "1.2rem", color: "var(--neutral-900)", maxWidth: 780, margin: "0 auto 0.75rem", lineHeight: 1.5, fontWeight: 600 }}>
            Your career doesn&rsquo;t need more advice. It needs a system.
          </p>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iJobsOS runs a continuous six-stage loop — from evaluation to
            offer — handling the mechanics of your job search so you can
            focus on the one thing no AI can do for you: showing up and
            performing.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
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

        {/* Cycle SVG + stage detail (synced) */}
        <div className="root-js-cycle-grid" style={{ display: "grid", gap: "2.5rem", alignItems: "start", marginBottom: "4rem" }}>
          <div>
            <CareerCycleSVG
              centerLabel="iJobsOS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
              currentStage={currentStage}
            />
            <div style={{ textAlign:"center", marginTop:"0.5rem", fontSize:"0.85rem", color:"var(--neutral-700)" }}>
              Advances every 2s · dwells 10s on stage 6 · pauses on hover
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {STAGES.map(({ n, label, Icon: StageIcon, body }, i) => {
              const isActive = i === currentStage;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCurrentStage(i)}
                  aria-pressed={isActive}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "3rem 1fr",
                    gap: "1rem",
                    alignItems: "flex-start",
                    textAlign: "left",
                    background: isActive ? "rgba(0,184,169,0.08)" : "var(--neutral-100)",
                    border: `1px solid ${isActive ? "#00B8A9" : "var(--neutral-300)"}`,
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
                    background: isActive ? "rgba(0,184,169,0.20)" : "rgba(0,184,169,0.10)",
                    borderRadius: "0.6rem",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 400ms ease",
                  }}>
                    <StageIcon size={20} stroke={1.5} color="#00B8A9" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#00B8A9", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.15rem" }}>
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

        {/* Features grid (was 4 benefits; now 6 features lifted from jobs.* landing) */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2.5rem" }}>
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
