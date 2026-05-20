"use client";
import { useEffect, useState } from "react";
import {
  IconRulerMeasure, IconUserSearch, IconPuzzle, IconLifebuoy, IconStairsUp, IconAward,
  IconShieldCheck, IconReportAnalytics, IconClipboardList, IconHeartHandshake,
  IconBuilding, IconMailForward, IconAdjustments, IconBrain, IconX,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG } from "./CareerCycleSVG";

/**
 * RootHiringTeamSection — #hiring-teams section on icareeros.com.
 *
 * Rich audience section that consolidates what previously lived across
 * the root #hiring-teams section AND the hire.icareeros.com landing.
 * Structure: hero copy → pain → synced cycle SVG + stage detail with
 * metric pairs → features grid → CTA. Synced cycle is driven by a
 * useState counter that auto-advances every 3s (paused on hover).
 *
 * Per Amir 2026-05-20.
 */

const STAGES = [
  {
    n: 1, label: "Design", Icon: IconRulerMeasure,
    body: "Define the business need before hiring begins — workforce planning, role scoping, required capabilities, success measures. Reduces role ambiguity and costly hiring mistakes.",
    metrics: "Job description quality · Time to approval",
  },
  {
    n: 2, label: "Select", Icon: IconUserSearch,
    body: "Sourcing, screening, and choosing the best-fit candidate with structured interviews and consistent criteria. Improves quality of hire and reduces turnover caused by poor role fit.",
    metrics: "Time to hire · Quality of hire",
  },
  {
    n: 3, label: "Integrate", Icon: IconPuzzle,
    body: "Onboarding and early assimilation — orientation, 30-60-90 day plans, system access, manager check-ins. Accelerates time-to-productivity and reduces early attrition.",
    metrics: "90-day retention · Time to productivity",
  },
  {
    n: 4, label: "Support", Icon: IconLifebuoy,
    body: "The daily employee experience after onboarding — leadership support, recognition, workload balance, feedback loops. Removes friction before dissatisfaction becomes turnover.",
    metrics: "Engagement scores · Manager effectiveness",
  },
  {
    n: 5, label: "Develop", Icon: IconStairsUp,
    body: "Capability and future readiness — coaching, training, cross-skilling, leadership development, career pathing. People stay when they see growth and meaningful development.",
    metrics: "Training completion · Internal promotion rate",
  },
  {
    n: 6, label: "Retain", Icon: IconAward,
    body: "Active preservation of key talent — compensation review, flexibility, stay interviews, retention risk tracking. Protects institutional knowledge and lowers replacement cost.",
    metrics: "Turnover rate · Regretted-loss rate · Stay-interview themes",
  },
] as const;

const PAINS = [
  "Sourcing lists full of people who haven't looked for a job in three years",
  "InMails ignored because candidates are not actually looking",
  "Screening calls that reveal the resume was a stretch",
  "Offer stage surprises — salary expectations nowhere near reality",
  "Time-to-fill measured in months, not weeks",
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconBrain, title: "AI JD analysis",
    body: "Paste a job description, get instant fit scoring against your candidate pool. Know who to talk to before you start talking." },
  { Icon: IconShieldCheck, title: "Verified, opt-in candidates",
    body: "No scraped profiles. No cold lists. Every candidate created an account and chose to be found — which means they're actually looking." },
  { Icon: IconAdjustments, title: "Filters that matter",
    body: "Role, location, experience level, remote preference. Filter to candidates who match your actual requirements — not keyword guesses." },
  { Icon: IconMailForward, title: "Direct in-app invites",
    body: "Reach candidates where they're managing their job search. Track invite status. Know who's engaged and who isn't." },
  { Icon: IconBuilding, title: "Company profile",
    body: "Show candidates who you are before they decide whether to respond. Culture, mission, open roles — in one employer page." },
  { Icon: IconReportAnalytics, title: "Measurable per-stage outcomes",
    body: "Each stage has an owner, a workflow, and a metric. The system runs on signals — time-to-hire, 90-day retention, internal promotion rate — not intuition." },
];

const BENEFITS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconShieldCheck,
    title: "Lower avoidable turnover",
    body:  "iTalentOS treats retention as the result of disciplined upstream management — clearer role design, better fit, stronger onboarding — not a single HR program bolted on at the end.",
  },
  {
    Icon: IconClipboardList,
    title: "Closed loop, not a bolt-on",
    body:  "Design feeds Select; Select feeds Integrate; Integrate feeds Support; and Retain feeds the next Design cycle. Continuous improvement of the workforce.",
  },
  {
    Icon: IconHeartHandshake,
    title: "A direct line to engaged candidates",
    body:  "iCareerOS candidates run their own iJobsOS loop — assessing fit, building skills, preparing for interviews — and opt in to be discovered. A different kind of first conversation.",
  },
];

// Per-stage dwell times (ms). Stages 1-5 advance every 2s; stage 6
// dwells for 10s before wrapping back to stage 1. Per Amir 2026-05-20.
const STAGE_DURATIONS_MS = [2000, 2000, 2000, 2000, 2000, 10000];

export function RootHiringTeamSection() {
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
      id="hiring-teams"
      className="landing-fade-bg"
      style={{ padding: "6rem 3rem", background: "var(--neutral-100)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Heading block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ color: "#00B8A9", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For hiring teams
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            iTalentOS — the intelligent talent OS for hiring teams.
          </h2>
          <p style={{ fontSize: "1.2rem", color: "var(--neutral-900)", maxWidth: 780, margin: "0 auto 0.75rem", lineHeight: 1.5, fontWeight: 600 }}>
            Hire people who chose to be found.
          </p>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iCareerOS candidates aren&rsquo;t passive. They&rsquo;re actively
            managing their careers — assessing fit, building skills,
            preparing for interviews — and they&rsquo;ve opted in to be
            discovered. That&rsquo;s a different kind of candidate, and
            iTalentOS gives hiring teams a system to find, engage, and
            retain them.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
            Most hiring tools were built for the wrong problem.
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

        {/* Cycle SVG + stage detail (synced) with metric pairs */}
        <h3 style={{ fontSize:"1.6rem", fontWeight:700, marginBottom:"0.5rem", color:"var(--neutral-900)", textAlign:"center" }}>
          The six iTalentOS stages.
        </h3>
        <p style={{ textAlign:"center", color:"var(--neutral-700)", maxWidth:740, margin:"0 auto 2.5rem", lineHeight:1.6 }}>
          Workforce stability is the outcome of disciplined upstream
          management, not a single HR program. Each stage has an owner,
          a workflow, and measurable outcomes.
        </p>
        <div className="root-ht-cycle-grid" style={{ display: "grid", gap: "2.5rem", alignItems: "start", marginBottom: "4rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {STAGES.map(({ n, label, Icon: StageIcon, body, metrics }, i) => {
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
                    transform: isActive ? "translateX(-4px)" : "translateX(0)",
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
                    <div style={{ color: "var(--neutral-800)", fontSize: "0.96rem", lineHeight: 1.55, marginBottom: "0.5rem" }}>
                      {body}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--neutral-700)" }}>
                      <span style={{ fontWeight:700, color:"#00B8A9", textTransform:"uppercase", letterSpacing:"1px", fontSize:"0.7rem", marginRight:"0.4rem" }}>
                        Outcomes
                      </span>
                      {metrics}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <CareerCycleSVG
              centerLabel="iTalentOS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
              currentStage={currentStage}
            />
            <div style={{ textAlign:"center", marginTop:"0.5rem", fontSize:"0.85rem", color:"var(--neutral-700)" }}>
              Advances every 2s · dwells 10s on stage 6 · pauses on hover
            </div>
          </div>
        </div>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2.5rem" }}>
          Everything you need. Nothing you don&rsquo;t.
        </h3>
        <div className="root-ht-features-grid" style={{ display: "grid", gap: "1.5rem", marginBottom: "3rem" }}>
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

        {/* Benefits / why it works */}
        <h3 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2rem" }}>
          Why it works.
        </h3>
        <div className="root-ht-benefits-grid" style={{ display: "grid", gap: "1.5rem", marginBottom: "3rem" }}>
          {BENEFITS.map(({ Icon: BenefitIcon, title, body }) => (
            <div key={title} style={{
              background: "var(--neutral-100)",
              padding: "1.75rem 1.5rem",
              borderRadius: "1.25rem",
              border: "1px solid var(--neutral-300)",
              textAlign: "left",
            }}>
              <div style={{
                width: 44, height: 44,
                background: "rgba(0,184,169,0.10)",
                borderRadius: "0.65rem",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "1rem",
              }}>
                <BenefitIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h4 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--neutral-900)" }}>{title}</h4>
              <p style={{ color: "var(--neutral-700)", fontSize: "0.95rem", lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>

      </div>

      <style>{`
        .root-ht-cycle-grid     { grid-template-columns: 1fr; }
        .root-ht-features-grid  { grid-template-columns: 1fr; }
        .root-ht-benefits-grid  { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .root-ht-features-grid  { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .root-ht-benefits-grid  { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (min-width: 900px) {
          .root-ht-cycle-grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
        }
        @media (min-width: 1100px) {
          .root-ht-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
