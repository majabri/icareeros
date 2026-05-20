"use client";

/**
 * RootStagesSection — condensed 6-stage timeline on icareeros.com.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 3 —
 * "The six iJobsOS stages."
 *
 * One-line bodies only; the long-form treatment lives on jobs.* via
 * JobsStagesSection.
 */
const STAGES = [
  { n: "1", title: "Evaluate", line: "Honest skills assessment and market fit baseline." },
  { n: "2", title: "Advise",   line: "Resume analysis, fit scores, role targeting." },
  { n: "3", title: "Learn",    line: "Personalised skill-building paths from your actual gaps." },
  { n: "4", title: "Act",      line: "Tailored applications, tracked pipeline, outreach templates." },
  { n: "5", title: "Coach",    line: "Interview prep, negotiation coaching, offer review." },
  { n: "6", title: "Achieve",  line: "Land the role. Reset for the next goal." },
];

export function RootStagesSection() {
  return (
    <section id="stages" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>
          The six iJobsOS stages.
        </h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3rem", textAlign:"center" }}>
          Built for job seekers. Visible to hiring teams on the other side.
        </p>

        <ol style={{
          listStyle:"none", padding:0, margin:0,
          display:"grid", gap:"1rem",
        }}>
          {STAGES.map(({ n, title, line }) => (
            <li
              key={n}
              style={{
                display:"grid",
                gridTemplateColumns:"3.5rem 9rem 1fr",
                alignItems:"baseline",
                gap:"1rem",
                padding:"1.25rem 1.5rem",
                background:"var(--neutral-100)",
                border:"1px solid var(--neutral-300)",
                borderRadius:"0.85rem",
              }}
            >
              <span aria-hidden style={{
                fontSize:"2rem", fontWeight:800, color:"#00B8A9", lineHeight:1,
              }}>{n}</span>
              <span style={{
                fontSize:"1.1rem", fontWeight:700, color:"var(--neutral-900)",
              }}>{title}</span>
              <span style={{
                fontSize:"1rem", color:"var(--neutral-700)", lineHeight:1.5,
              }}>{line}</span>
            </li>
          ))}
        </ol>

        <p style={{ textAlign:"center", marginTop:"2rem", fontSize:"0.95rem", color:"var(--neutral-700)" }}>
          ↻ Continuous loop — each stage feeds the next until you hit your milestone, then resets.
        </p>
      </div>
    </section>
  );
}
