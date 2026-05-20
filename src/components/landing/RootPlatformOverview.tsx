"use client";
import { IconUser, IconBuilding } from "@tabler/icons-react";

/**
 * RootPlatformOverview — two-column platform overview on icareeros.com.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 3 —
 * "Two experiences. One connected system."
 */
export function RootPlatformOverview() {
  return (
    <section id="platform" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Two experiences. One connected system.
        </h2>
        <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", marginBottom:"3.5rem", maxWidth:760, margin:"0 auto 3.5rem", textAlign:"center", lineHeight:1.6 }}>
          The platform works because job seekers and hiring teams are
          building toward the same outcome — from opposite sides.
        </p>

        <div className="root-overview-grid" style={{ display:"grid", gap:"2rem" }}>
          {/* Job seeker column */}
          <div
            id="job-seekers"
            style={{
              background:"var(--neutral-100)",
              padding:"3rem 2.5rem",
              borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left",
            }}
          >
            <div style={{
              width:48, height:48,
              background:"rgba(0,184,169,0.10)",
              borderRadius:"0.75rem",
              display:"flex", alignItems:"center", justifyContent:"center",
              marginBottom:"1.25rem",
            }}>
              <IconUser size={20} stroke={1.5} color="#00B8A9" />
            </div>
            <h3 style={{ fontSize:"1.5rem", fontWeight:700, marginBottom:"1rem", color:"var(--neutral-900)" }}>For job seekers</h3>
            <div style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.7, display:"flex", flexDirection:"column", gap:"1rem", marginBottom:"1.75rem" }}>
              <p>
                A six-stage career OS that runs from where you are today
                to where you want to be — continuously, not one-and-done.
                Evaluate your market fit. Get AI-driven advice. Close
                skill gaps. Apply with precision. Prepare for interviews.
                Manage offers.
              </p>
              <p>
                When you land the role, the loop resets. Because your
                career doesn&rsquo;t stop — and neither does the OS.
              </p>
            </div>
            <a href="https://jobs.icareeros.com" style={{
              color:"#00B8A9", fontWeight:600, textDecoration:"none", fontSize:"0.98rem",
            }}>
              See the job seeker experience →
            </a>
          </div>

          {/* Hiring team column */}
          <div
            id="hiring-teams"
            style={{
              background:"var(--neutral-100)",
              padding:"3rem 2.5rem",
              borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left",
            }}
          >
            <div style={{
              width:48, height:48,
              background:"rgba(0,184,169,0.10)",
              borderRadius:"0.75rem",
              display:"flex", alignItems:"center", justifyContent:"center",
              marginBottom:"1.25rem",
            }}>
              <IconBuilding size={20} stroke={1.5} color="#00B8A9" />
            </div>
            <h3 style={{ fontSize:"1.5rem", fontWeight:700, marginBottom:"1rem", color:"var(--neutral-900)" }}>For hiring teams</h3>
            <div style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.7, display:"flex", flexDirection:"column", gap:"1rem", marginBottom:"1.75rem" }}>
              <p>
                A hiring workflow built around candidates who chose to be
                found. Search opt-in talent by role, location, and
                experience. Analyse job descriptions for fit before you
                start screening. Send direct invites and track your
                pipeline — without cold lists or wasted outreach.
              </p>
              <p>
                Every candidate you reach is actively managing their
                career. That&rsquo;s a different kind of first conversation.
              </p>
            </div>
            <a href="https://hire.icareeros.com" style={{
              color:"#00B8A9", fontWeight:600, textDecoration:"none", fontSize:"0.98rem",
            }}>
              See the hiring experience →
            </a>
          </div>
        </div>
      </div>

      <style>{`
        .root-overview-grid { grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .root-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
