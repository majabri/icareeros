"use client";
import {
  IconRulerMeasure, IconUserSearch, IconPuzzle, IconLifebuoy, IconStairsUp, IconAward,
  IconShieldCheck, IconReportAnalytics, IconChartHistogram, IconHeartHandshake,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG } from "./CareerCycleSVG";

/**
 * RootHiringTeamSection — #hiring-teams section on icareeros.com.
 *
 * Per Amir 2026-05-20 (second iteration): the hiring-team side runs on
 * the **Talent OS** framework (sister to Career OS on the job-seeker
 * side). The six stages are Design / Select / Integrate / Support /
 * Develop / Retain — operational stages of the People Retention
 * Pathway as sourced from standard HR literature, renamed for the
 * iCareerOS brand. Verbatim stage definitions from Amir's spec.
 *
 * Replaces the earlier mis-framing of "Career OS for hiring teams"
 * from PR #266 — hiring teams don't run the Career OS (that's the
 * candidate's framework).
 */

const STAGES = [
  { n: 1, label: "Design",    Icon: IconRulerMeasure,
    body: "Define the business need before hiring begins — workforce planning, role scoping, required capabilities, success measures. Reduces role ambiguity and costly hiring mistakes." },
  { n: 2, label: "Select",    Icon: IconUserSearch,
    body: "Sourcing, screening, and choosing the best-fit candidate with structured interviews and consistent criteria. Improves quality of hire and reduces turnover caused by poor role fit." },
  { n: 3, label: "Integrate", Icon: IconPuzzle,
    body: "Onboarding and early assimilation — orientation, 30-60-90 day plans, system access, manager check-ins. Accelerates time-to-productivity and reduces early attrition." },
  { n: 4, label: "Support",   Icon: IconLifebuoy,
    body: "The daily employee experience after onboarding — leadership support, recognition, workload balance, feedback loops. Removes friction before dissatisfaction becomes turnover." },
  { n: 5, label: "Develop",   Icon: IconStairsUp,
    body: "Capability and future readiness — coaching, training, cross-skilling, leadership development, career pathing. People stay when they see growth and meaningful development." },
  { n: 6, label: "Retain",    Icon: IconAward,
    body: "Active preservation of key talent — compensation review, flexibility, stay interviews, retention risk tracking. Protects institutional knowledge and lowers replacement cost." },
] as const;

const BENEFITS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconShieldCheck,
    title: "Lower avoidable turnover",
    body:  "Talent OS treats retention as the result of disciplined upstream management — clearer role design, better fit, stronger onboarding, deeper development — not a single HR program bolted on at the end.",
  },
  {
    Icon: IconChartHistogram,
    title: "Measurable outcomes per stage",
    body:  "Each stage has an owner, a workflow, and a metric: time-to-hire, 90-day retention, engagement scores, internal promotion rate, regretted-loss rate. The system runs on signals, not intuition.",
  },
  {
    Icon: IconReportAnalytics,
    title: "Closed-loop, not a bolt-on",
    body:  "Design feeds Select; Select feeds Integrate; Integrate feeds Support; and Retain feeds the next Design cycle. Continuous improvement of the workforce, not a series of disconnected HR projects.",
  },
  {
    Icon: IconHeartHandshake,
    title: "A direct line to engaged candidates",
    body:  "iCareerOS candidates run their own Career OS loop — assessing fit, building skills, preparing for interviews — and opt in to be discovered. A different kind of first conversation between hiring teams and the people they want to hire.",
  },
];

export function RootHiringTeamSection() {
  return (
    <section id="hiring-teams" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:"3rem" }}>
          <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"0.95rem", marginBottom:"0.75rem", textTransform:"uppercase", letterSpacing:"1px" }}>
            For hiring teams
          </div>
          <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", lineHeight:1.2 }}>
            A Talent OS for hiring teams.
          </h2>
          <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto", lineHeight:1.7 }}>
            Six stages that align role design, hiring, onboarding,
            employee support, development, and retention into one
            continuous system. Workforce stability becomes the outcome
            of disciplined upstream management — not a single HR program.
          </p>
        </div>

        {/* Cycle visual + stage detail */}
        <div className="root-ht-cycle-grid" style={{ display:"grid", gap:"2.5rem", alignItems:"start", marginBottom:"4rem" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.85rem" }}>
            {STAGES.map(({ n, label, Icon: StageIcon, body }) => (
              <div key={n} style={{
                display:"grid",
                gridTemplateColumns:"3rem 1fr",
                gap:"1rem",
                alignItems:"flex-start",
                background:"var(--neutral-100)",
                border:"1px solid var(--neutral-300)",
                borderRadius:"0.85rem",
                padding:"1rem 1.25rem",
              }}>
                <div style={{
                  width:40, height:40,
                  background:"rgba(0,184,169,0.10)",
                  borderRadius:"0.6rem",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <StageIcon size={20} stroke={1.5} color="#00B8A9" />
                </div>
                <div>
                  <div style={{ fontSize:"0.78rem", fontWeight:700, color:"#00B8A9", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"0.15rem" }}>
                    Stage {n} · {label}
                  </div>
                  <div style={{ color:"var(--neutral-800)", fontSize:"0.96rem", lineHeight:1.55 }}>
                    {body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <CareerCycleSVG
              centerLabel="Talent OS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
            />
          </div>
        </div>

        {/* Benefits grid */}
        <h3 style={{ fontSize:"1.85rem", fontWeight:700, color:"var(--neutral-900)", textAlign:"center", marginBottom:"2.5rem" }}>
          What hiring teams get out of running Talent OS.
        </h3>
        <div className="root-ht-benefits-grid" style={{ display:"grid", gap:"1.5rem", marginBottom:"3rem" }}>
          {BENEFITS.map(({ Icon: BenefitIcon, title, body }) => (
            <div key={title} style={{
              background:"var(--neutral-100)",
              padding:"2rem 1.75rem",
              borderRadius:"1.25rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left",
            }}>
              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.1rem",
              }}>
                <BenefitIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h4 style={{ fontSize:"1.1rem", fontWeight:700, marginBottom:"0.55rem", color:"var(--neutral-900)" }}>{title}</h4>
              <p style={{ color:"var(--neutral-700)", fontSize:"0.97rem", lineHeight:1.6 }}>{body}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign:"center" }}>
          <a
            href="https://hire.icareeros.com"
            style={{ color:"#00B8A9", fontWeight:600, textDecoration:"none", fontSize:"1.05rem" }}
          >
            See the hiring experience →
          </a>
        </div>
      </div>

      <style>{`
        .root-ht-cycle-grid { grid-template-columns: 1fr; }
        .root-ht-benefits-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-ht-cycle-grid    { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
          .root-ht-benefits-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
