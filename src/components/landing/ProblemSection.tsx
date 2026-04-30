const PROBLEMS = [
  "Spending 20+ hours writing applications",
  "Rejections with no feedback",
  "Resume feels... generic",
  "No clarity on what's actually next",
  "Going it alone",
];
export function ProblemSection() {
  return (
    <section style={{ padding:"4rem 3rem", background:"linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)" }}>
      <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"2rem", color:"var(--neutral-900)" }}>
          Your Job Search Shouldn&rsquo;t Feel Like This
        </h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem", textAlign:"left", marginBottom:"2rem" }}>
          {PROBLEMS.map(p => (
            <div key={p} style={{ fontSize:"1.1rem", color:"var(--neutral-700)", paddingLeft:"3rem", position:"relative" }}>
              <span style={{ position:"absolute", left:0, fontSize:"1.5rem" }}>❌</span>
              {p}
            </div>
          ))}
        </div>

        <div style={{ fontSize:"1.2rem", color:"var(--neutral-900)", fontWeight:600, marginTop:"2rem", paddingTop:"2rem", borderTop:"2px solid var(--neutral-300)" }}>
          Here&rsquo;s what changes with iCareerOS
        </div>
      </div>
    </section>
  );
}
