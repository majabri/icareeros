"use client";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconReportAnalytics, IconShieldCheck, IconClipboardList, IconHeartHandshake,
  type Icon,
} from "@tabler/icons-react";
import { CareerCycleSVG } from "./CareerCycleSVG";

/**
 * RootHiringTeamSection — #hiring-teams section on icareeros.com.
 *
 * Per Amir 2026-05-20: intelligent career OS for employers; improve
 * hiring-manager engagement; explanation + data; benefits; value of
 * an easier interface with employees/job seekers. Show the 6 stages
 * with animation, with description per stage.
 *
 * The cycle is the SAME six-stage Career OS framework — the platform's
 * core differentiator is that hiring teams see what candidates are
 * doing at each stage, not a different process running in parallel.
 * Descriptions are written from the employer's perspective.
 */

const STAGES = [
  { n: 1, label: "Evaluate", Icon: IconCompass,
    body: "Filter the pool by candidates who've done their own market-fit assessment — and who match the requirements in your JD." },
  { n: 2, label: "Advise",   Icon: IconTarget,
    body: "Paste a JD, get AI fit scores against every opted-in candidate. Know who to talk to before you start typing." },
  { n: 3, label: "Learn",    Icon: IconBooks,
    body: "See which candidates are closing the skill gaps that matter for your role. Spot rising talent before competitors do." },
  { n: 4, label: "Act",      Icon: IconSearch,
    body: "Receive tailored applications, not mass blasts. Track invites, responses, and engagement across your pipeline." },
  { n: 5, label: "Coach",    Icon: IconMicrophone,
    body: "Candidates who've done role-specific interview prep show up ready. Shorter cycles, sharper conversations." },
  { n: 6, label: "Achieve",  Icon: IconTrophy,
    body: "Track offer acceptance, manage the relationship, build the talent network for your next great hire." },
] as const;

const BENEFITS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconShieldCheck,
    title: "Verified, opt-in candidate pool",
    body:  "No scraped profiles. No cold lists. Every candidate created an account and chose to be discoverable — which means they're actually looking.",
  },
  {
    Icon: IconReportAnalytics,
    title: "Fit scores before you reach out",
    body:  "AI scores every opted-in candidate against your JD. Skip the screening calls that go nowhere; spend your time on the conversations that count.",
  },
  {
    Icon: IconClipboardList,
    title: "Visibility into how candidates prepared",
    body:  "See which candidates have done role-specific interview prep and skill-building. Walk into the conversation knowing they're ready.",
  },
  {
    Icon: IconHeartHandshake,
    title: "A direct line to engaged people",
    body:  "iCareerOS candidates aren't passively browsing — they're actively running their own career loop. A different kind of first conversation, and a different conversion rate.",
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
            An intelligent career OS for hiring teams.
          </h2>
          <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto", lineHeight:1.7 }}>
            The same six-stage loop — viewed from the other side. Every
            candidate you reach is already running it, already preparing,
            already signalling intent.
          </p>
        </div>

        {/* Cycle visual + employer-perspective stage detail */}
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
              centerLabel="Hire OS"
              stages={STAGES.map(s => ({ n: s.n, label: s.label }))}
            />
          </div>
        </div>

        {/* Benefits grid — employer-side */}
        <h3 style={{ fontSize:"1.85rem", fontWeight:700, color:"var(--neutral-900)", textAlign:"center", marginBottom:"2.5rem" }}>
          What hiring teams get out of the loop.
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
