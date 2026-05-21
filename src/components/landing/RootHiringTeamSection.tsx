"use client";
import {
  IconRulerMeasure, IconUserSearch, IconPuzzle, IconLifebuoy, IconStairsUp, IconAward,
  IconShieldCheck, IconReportAnalytics, IconClipboardList, IconHeartHandshake,
  IconBuilding, IconMailForward, IconAdjustments, IconBrain, IconX,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG, STAGE_COLORS } from "./CareerCycleSVG";
import { useCycleRotation } from "./useCycleRotation";

/**
 * RootHiringTeamSection — #hiring-teams section on icareeros.com.
 *
 * The hire side of the intelligent operating system. iTalentOS runs the
 * six-stage workforce loop — Design through Retain — built from
 * standard HR research on the People Retention Pathway and renamed
 * for the iCareerOS brand.
 *
 * Stage cards beside the cycle pick up per-stage brand colors so the
 * full color rotation reads in both the SVG ring and the description
 * column.
 *
 * Per Amir 2026-05-20.
 */

const STAGES = [
  {
    n: 1, label: "Design", Icon: IconRulerMeasure,
    body: "Define the business need before hiring begins — workforce planning, role scoping, required capabilities, success measures. Cuts role ambiguity and costly mishires.",
    metrics: "Job description quality · Time to approval",
  },
  {
    n: 2, label: "Select", Icon: IconUserSearch,
    body: "Source, screen, choose the best-fit candidate with structured interviews and consistent criteria. Improves quality of hire and reduces turnover from poor role fit.",
    metrics: "Time to hire · Quality of hire",
  },
  {
    n: 3, label: "Integrate", Icon: IconPuzzle,
    body: "Onboarding and early assimilation — orientation, 30-60-90 day plans, system access, manager check-ins. Speeds time-to-productivity and reduces early attrition.",
    metrics: "90-day retention · Time to productivity",
  },
  {
    n: 4, label: "Support", Icon: IconLifebuoy,
    body: "The daily employee experience after onboarding — leadership support, recognition, workload balance, feedback loops. Removes friction before it becomes turnover.",
    metrics: "Engagement scores · Manager effectiveness",
  },
  {
    n: 5, label: "Develop", Icon: IconStairsUp,
    body: "Capability and future readiness — coaching, training, cross-skilling, leadership development, career pathing. People stay when they see real growth ahead.",
    metrics: "Training completion · Internal promotion rate",
  },
  {
    n: 6, label: "Retain", Icon: IconAward,
    body: "Active preservation of key talent — compensation review, flexibility, stay interviews, retention-risk tracking. Protects institutional knowledge; cuts replacement cost.",
    metrics: "Turnover rate · Regretted-loss rate · Stay-interview themes",
  },
] as const;

const PAINS = [
  "Sourcing lists full of people who haven't looked for a job in three years",
  "InMails ignored because the candidates aren't actually looking",
  "Screening calls where the resume turns out to be a stretch",
  "Offer-stage surprises — salary expectations nowhere near reality",
  "Time-to-fill measured in months, not weeks",
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconBrain, title: "AI JD analysis",
    body: "Paste a job description. Get instant fit scoring against your candidate pool. Know who to talk to before you start talking." },
  { Icon: IconShieldCheck, title: "Verified, opt-in candidates",
    body: "No scraped profiles. No cold lists. Every candidate signed up and chose to be found — which means they're actually looking." },
  { Icon: IconAdjustments, title: "Filters that matter",
    body: "Role, location, experience level, remote preference. Filter to candidates who match your actual requirements — not keyword guesses." },
  { Icon: IconMailForward, title: "Direct in-app invites",
    body: "Reach candidates where they're already managing their job search. Track invite status. See who's engaged and who isn't." },
  { Icon: IconBuilding, title: "Company profile",
    body: "Show candidates who you are before they decide whether to respond. Culture, mission, open roles — in one employer page." },
  { Icon: IconReportAnalytics, title: "Measurable per-stage outcomes",
    body: "Each stage has an owner, a workflow, and a metric — time-to-hire, 90-day retention, internal promotion rate. The system runs on signals, not intuition." },
];

const BENEFITS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconShieldCheck,
    title: "Lower avoidable turnover",
    body:  "iTalentOS treats retention as the outcome of disciplined upstream management — clearer role design, better fit, stronger onboarding — not a single HR program bolted on at the end.",
  },
  {
    Icon: IconClipboardList,
    title: "Closed loop, not a bolt-on",
    body:  "Design feeds Select; Select feeds Integrate; Integrate feeds Support; Retain feeds the next Design cycle. Continuous workforce improvement, not a series of disconnected HR projects.",
  },
  {
    Icon: IconHeartHandshake,
    title: "A direct line to engaged candidates",
    body:  "iCareerOS candidates run their own iJobsOS loop — assessing fit, building skills, preparing for interviews — and they opt in to be discovered. That's a different kind of first conversation.",
  },
];

// Same per-stage dwell shape as the job-seeker side: 5×2s + 5s on stage 6.
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
          <div style={{ color: "#00B8A9", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For hiring teams
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            iTalentOS — the intelligent talent operating system.
          </h2>
          <p style={{ fontSize: "1.2rem", color: "var(--neutral-900)", maxWidth: 780, margin: "0 auto 0.75rem", lineHeight: 1.5, fontWeight: 600 }}>
            Hire people who chose to be found.
          </p>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iCareerOS candidates aren&rsquo;t passive. They&rsquo;re
            actively managing their careers — assessing fit, building
            skills, prepping for interviews — and they&rsquo;ve opted
            in to be discovered. iTalentOS gives hiring teams the
            system to find, engage, integrate, and retain them.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
            Most hiring tools solve the wrong problem.
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

        {/* Cycle SVG + stage detail with metric pairs */}
        <h3 style={{ fontSize:"1.6rem", fontWeight:700, marginBottom:"0.5rem", color:"var(--neutral-900)", textAlign:"center" }}>
          The six iTalentOS stages.
        </h3>
        <p style={{ textAlign:"center", color:"var(--neutral-700)", maxWidth:740, margin:"0 auto 2.5rem", lineHeight:1.6 }}>
          Workforce stability is the outcome of disciplined upstream
          management. Each stage has an owner, a workflow, and a
          measurable outcome — the system runs on signals, not
          intuition.
        </p>
        <div className="root-ht-cycle-grid" style={{ display: "grid", gap: "2.5rem", alignItems: "start", marginBottom: "4rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {STAGES.map(({ n, label, Icon: StageIcon, body, metrics }, i) => {
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
                    transform: isActive ? "translateX(-4px)" : "translateX(0)",
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
                    <div style={{ color: "var(--neutral-800)", fontSize: "0.96rem", lineHeight: 1.55, marginBottom: "0.5rem" }}>
                      {body}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--neutral-700)" }}>
                      <span style={{ fontWeight:700, color: stageColor, textTransform:"uppercase", letterSpacing:"1px", fontSize:"0.7rem", marginRight:"0.4rem" }}>
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
              Flashes every 2s · pauses 5s on stage 6 · hover to freeze
            </div>
          </div>
        </div>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "0.5rem" }}>
          Everything you need.
        </h3>
        <p style={{ textAlign: "center", color: "var(--neutral-700)", marginBottom: "2.5rem", fontSize: "1rem" }}>
          Nothing you don&rsquo;t.
        </p>
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
        <div className="root-ht-benefits-grid" style={{ display: "grid", gap: "1.5rem" }}>
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
