"use client";
import { IconRefresh, IconRoute, IconUsers, type Icon } from "@tabler/icons-react";

/**
 * RootPlatformInnovation — #platform section on icareeros.com.
 *
 * Per Amir 2026-05-20: talk about the innovation of the platform that
 * is working on a proven framework and improve the human capital + work
 * employer relationship. Replaces the original two-column
 * RootPlatformOverview anchor for #platform.
 */

const PILLARS: Array<{ Icon: Icon; title: string; body: string }> = [
  {
    Icon: IconRefresh,
    title: "Continuous, not one-off",
    body:  "Most career tools solve a single moment. iCareerOS runs a continuous loop — every stage informs the next, and the loop resets when you hit the milestone.",
  },
  {
    Icon: IconRoute,
    title: "A framework that already works",
    body:  "Operating systems run on loops. Project management runs on loops. Incident response runs on loops. iCareerOS applies the same proven pattern to careers and hiring.",
  },
  {
    Icon: IconUsers,
    title: "Both sides of hiring, connected",
    body:  "Job seekers and hiring teams aren't running parallel processes — they're building toward the same outcome from opposite sides. The OS connects the two in one system.",
  },
];

export function RootPlatformInnovation() {
  return (
    <section id="platform" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:"3.5rem" }}>
          <div style={{ color:"#00B8A9", fontWeight:600, fontSize:"0.95rem", marginBottom:"0.75rem", textTransform:"uppercase", letterSpacing:"1px" }}>
            The platform
          </div>
          <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", lineHeight:1.2 }}>
            Innovation built on a framework that already works.
          </h2>
          <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", maxWidth:780, margin:"0 auto", lineHeight:1.7 }}>
            Career platforms keep treating careers like one-off transactions.
            iCareerOS treats them like systems — and runs the loop
            continuously, for both sides of hiring.
          </p>
        </div>

        {/* Body — three short paragraphs */}
        <div style={{ maxWidth:780, margin:"0 auto 3.5rem", display:"flex", flexDirection:"column", gap:"1.5rem", color:"var(--neutral-800)", fontSize:"1.08rem", lineHeight:1.75 }}>
          <p>
            The framework isn&rsquo;t new. Operating systems run on continuous
            loops. Project management runs on continuous loops. Incident
            response runs on continuous loops. The pattern is the same
            everywhere: detect, analyse, respond, improve — and every
            cycle makes the next one tighter.
          </p>
          <p>
            What&rsquo;s new is applying that pattern to the most fragmented
            market in the world. Careers and hiring sit at the intersection
            of human capital, market signals, and time — and most existing
            tools solve a single slice of one of those. iCareerOS connects
            all of them, on both sides, in one continuous system.
          </p>
          <p>
            For the person looking for a role, that means evaluation,
            advice, learning, action, coaching, and outcome — all
            connected, all informed by the stage before. For the team
            doing the hiring, that means access to candidates who are
            already prepared, already running the loop, already
            signalling intent. The result is a hiring market that
            actually works for both sides — a continuous channel between
            human capital and the people who hire it, instead of a
            one-time transaction.
          </p>
        </div>

        {/* Three-pillar grid */}
        <div className="root-pillars-grid" style={{ display:"grid", gap:"1.75rem" }}>
          {PILLARS.map(({ Icon: PillarIcon, title, body }) => (
            <div key={title} style={{
              background:"var(--neutral-100)",
              padding:"2.25rem 2rem",
              borderRadius:"1.25rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left",
            }}>
              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.25rem",
              }}>
                <PillarIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h3 style={{ fontSize:"1.2rem", fontWeight:700, marginBottom:"0.65rem", color:"var(--neutral-900)" }}>{title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"0.98rem", lineHeight:1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .root-pillars-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-pillars-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
