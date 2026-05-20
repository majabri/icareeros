"use client";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconBrain, IconChartBar, IconRoute, IconMessages,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG } from "./CareerCycleSVG";

/**
 * RootJobSeekerSection — #job-seekers section on icareeros.com.
 *
 * Per Amir 2026-05-20: intelligent career OS for job seekers, with the
 * 6-stage cycle image, benefits of the method + platform, and the
 * value of an easier interface with hiring managers and recruiters.
 *
 * Replaces the left column of the original RootPlatformOverview.
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

const BENEFITS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconBrain,
    title: "AI-driven advice tailored to you",
    body:  "Not generic 'optimise your resume' tips. Specific guidance built from your background, your target roles, and the current market.",
  },
  {
    Icon: IconChartBar,
    title: "Real data before you apply",
    body:  "Fit scores against real job descriptions, skill-gap analysis from real market signals. Apply where it counts; close the gaps that matter.",
  },
  {
    Icon: IconRoute,
    title: "A continuous system, not a one-time tool",
    body:  "Every stage informs the next. When you land the role, the OS doesn't stop — it resets for the next milestone.",
  },
  {
    Icon: IconMessages,
    title: "A direct line to hiring teams who want to talk",
    body:  "Hiring teams searching iCareerOS see candidates who've actively opted in and prepared. No cold outreach, no recruiter spam — a cleaner first conversation.",
  },
];

export function RootJobSeekerSection() {
  return (
    <section id="job-seekers" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:"3rem" }}>
          <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"0.95rem", marginBottom:"0.75rem", textTransform:"uppercase", letterSpacing:"1px" }}>
            For job seekers
          </div>
          <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", lineHeight:1.2 }}>
            An intelligent career OS for job seekers.
          </h2>
          <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto", lineHeight:1.7 }}>
            Six stages. One continuous loop. A system that runs from where
            you are today to where you want to be — then resets for the
            next goal.
          </p>
        </div>

        {/* Cycle visual + stage detail list, side by side on wider screens */}
        <div className="root-js-cycle-grid" style={{ display:"grid", gap:"2.5rem", alignItems:"start", marginBottom:"4rem" }}>
          <div>
            <CareerCycleSVG
              centerLabel="Career OS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
            />
          </div>

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
        </div>

        {/* Benefits grid — what you get out of using this method + platform */}
        <h3 style={{ fontSize:"1.85rem", fontWeight:700, color:"var(--neutral-900)", textAlign:"center", marginBottom:"2.5rem" }}>
          What you get out of running the loop.
        </h3>
        <div className="root-js-benefits-grid" style={{ display:"grid", gap:"1.5rem", marginBottom:"3rem" }}>
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
            href="https://jobs.icareeros.com"
            style={{ color:"#00B8A9", fontWeight:600, textDecoration:"none", fontSize:"1.05rem" }}
          >
            See the job seeker experience →
          </a>
        </div>
      </div>

      <style>{`
        .root-js-cycle-grid { grid-template-columns: 1fr; }
        .root-js-benefits-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-js-cycle-grid    { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
          .root-js-benefits-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
