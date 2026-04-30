const FAQS = [
  { q:"Q: Will this really get me hired?",
    a:"iCareerOS dramatically improves your odds by handling the mechanics (resume optimization, application tailoring, interview prep). But your fit, experience, and interview performance still matter. We give you the edge." },
  { q:"Q: How is this different from just applying myself?",
    a:"You can apply manually and hope. Or use iCareerOS to apply 24/7 while you focus on interview prep and skill-building. 92% of users report higher confidence in career decisions." },
  { q:"Q: What happens if no good roles match?",
    a:"Our AI surfaces opportunities across 10,000+ companies in your target categories. Most users see 5+ qualified opportunities per week. But if there's truly nothing, we're transparent about it." },
  { q:"Q: Is my data safe?",
    a:"Your resume and information are encrypted, never sold, and deleted on request. Security audit available upon request." },
  { q:"Q: Can I cancel anytime?",
    a:"Yes. Month-to-month, no lock-in. You own your data and can export it whenever you choose." },
];

export function FAQSection() {
  return (
    <section style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, textAlign:"center", marginBottom:"3rem", color:"var(--neutral-900)" }}>Common Questions</h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"2rem" }}>
          {FAQS.map(f => (
            <div key={f.q} style={{
              background:"var(--neutral-100)", border:"1px solid var(--neutral-300)",
              borderRadius:"1rem", padding:"2rem", transition:"all 0.3s",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="var(--primary)"; el.style.boxShadow="0 8px 20px rgba(0,217,255,0.1)"; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor="var(--neutral-300)"; el.style.boxShadow=""; }}>
              <div style={{ fontSize:"1.1rem", fontWeight:600, color:"var(--neutral-900)", marginBottom:"1rem" }}>{f.q}</div>
              <div style={{ color:"var(--neutral-700)", lineHeight:1.7, fontSize:"0.95rem" }}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
