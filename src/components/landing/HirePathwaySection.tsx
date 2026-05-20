"use client";
import { useEffect, useRef } from "react";
import {
  IconRulerMeasure, IconUserSearch, IconPuzzle, IconLifebuoy, IconStairsUp, IconAward,
  type Icon,
} from "@tabler/icons-react";

/**
 * HirePathwaySection — iTalentOS framework walkthrough on hire.icareeros.com.
 *
 * Per Amir 2026-05-20: the strategic framework underpinning what hiring
 * teams do in the platform. Six stages, verbatim definitions, plus the
 * operational metrics per stage from the spec. Sits between the Hero
 * and the product Workflow on the hire landing — the strategic story
 * (why this works) before the product story (what you do in the app).
 */

const STAGES: Array<{
  n: number;
  label: string;
  Icon: Icon;
  definition: string;
  metrics: string;
}> = [
  {
    n: 1, label: "Design", Icon: IconRulerMeasure,
    definition: "Define the business need before hiring begins — workforce planning, role scoping, job description creation, reporting lines, required capabilities, and success measures. Led jointly by HR and the hiring manager so the role is built around outcomes, not just tasks.",
    metrics:    "Job description quality · Time to approval",
  },
  {
    n: 2, label: "Select", Icon: IconUserSearch,
    definition: "Source, screen, and choose the best-fit candidate. Structured interviews, consistent evaluation criteria, efficient decision-making to avoid losing strong candidates during the hiring process.",
    metrics:    "Time to hire · Quality of hire",
  },
  {
    n: 3, label: "Integrate", Icon: IconPuzzle,
    definition: "Onboarding and early assimilation — orientation, role training, system access, 30-60-90 day plans, manager check-ins, culture integration. Accelerates time-to-productivity and reduces early attrition.",
    metrics:    "90-day retention · Time to productivity",
  },
  {
    n: 4, label: "Support", Icon: IconLifebuoy,
    definition: "The daily employee experience after onboarding — leadership support, communication cadence, recognition, workload balancing, feedback loops, and rapid issue resolution. Prevents dissatisfaction from becoming turnover.",
    metrics:    "Engagement scores · Manager effectiveness",
  },
  {
    n: 5, label: "Develop", Icon: IconStairsUp,
    definition: "Capability and future readiness — coaching, training, cross-skilling, leadership development, career pathing, and performance conversations tied to business goals. People stay when they see growth.",
    metrics:    "Training completion · Internal promotion rate",
  },
  {
    n: 6, label: "Retain", Icon: IconAward,
    definition: "Active preservation of key talent — compensation review, benefits, flexibility, recognition, stay interviews, engagement measurement, retention risk tracking. Protects institutional knowledge and lowers replacement cost.",
    metrics:    "Turnover rate · Regretted-loss rate · Stay-interview themes",
  },
];

export function HirePathwaySection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="talent-os" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div ref={ref} style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:"3.5rem" }}>
          <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"0.95rem", marginBottom:"0.75rem", textTransform:"uppercase", letterSpacing:"1px" }}>
            The framework
          </div>
          <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", lineHeight:1.2 }}>
            iTalentOS — six stages that build workforce stability.
          </h2>
          <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto", lineHeight:1.7 }}>
            Retention is the outcome of disciplined upstream management,
            not a single HR program. iTalentOS treats it as a closed-loop
            operating system — each stage with an owner, a workflow, and
            measurable outcomes.
          </p>
        </div>

        {/* Stage cards — definition + metrics per stage, two-column on wide screens */}
        <div className="hire-pathway-grid" style={{ display:"grid", gap:"1.5rem", marginBottom:"3rem" }}>
          {STAGES.map(({ n, label, Icon: StageIcon, definition, metrics }) => (
            <div key={n} className="fade-in" style={{
              background:"var(--neutral-100)",
              padding:"2rem 1.75rem",
              borderRadius:"1.25rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left",
              position:"relative",
            }}>
              {/* Large faded stage number, top-right corner */}
              <div style={{
                position:"absolute",
                top:"1rem", right:"1.25rem",
                fontSize:"3.25rem", fontWeight:800,
                color:"rgba(0,184,169,0.12)",
                lineHeight:1,
              }}>{n}</div>

              <div style={{ display:"flex", alignItems:"center", gap:"0.85rem", marginBottom:"1rem" }}>
                <div style={{
                  width:42, height:42,
                  background:"rgba(0,184,169,0.10)",
                  borderRadius:"0.65rem",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink:0,
                }}>
                  <StageIcon size={20} stroke={1.5} color="#00B8A9" />
                </div>
                <div>
                  <div style={{ fontSize:"0.78rem", fontWeight:700, color:"#00B8A9", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"0.15rem" }}>
                    Stage {n}
                  </div>
                  <div style={{ fontSize:"1.2rem", fontWeight:700, color:"var(--neutral-900)" }}>
                    {label}
                  </div>
                </div>
              </div>

              <p style={{ color:"var(--neutral-800)", fontSize:"0.97rem", lineHeight:1.65, marginBottom:"1rem" }}>
                {definition}
              </p>

              <div style={{
                borderTop:"1px dashed var(--neutral-300)",
                paddingTop:"0.85rem",
                fontSize:"0.85rem",
              }}>
                <span style={{ fontWeight:700, color:"#00B8A9", textTransform:"uppercase", letterSpacing:"1px", fontSize:"0.72rem", marginRight:"0.5rem" }}>
                  Outcomes
                </span>
                <span style={{ color:"var(--neutral-700)" }}>{metrics}</span>
              </div>
            </div>
          ))}
        </div>

        <p style={{ textAlign:"center", fontSize:"0.95rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto" }}>
          Design improves role clarity. Select improves fit. Integrate
          improves early commitment. Support improves daily experience.
          Develop improves future opportunity. Retain protects the talent
          investment. iCareerOS gives hiring teams a system to run each
          stage with discipline — and the candidate pool to make it work.
        </p>
      </div>

      <style>{`
        .hire-pathway-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .hire-pathway-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1100px) {
          .hire-pathway-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
