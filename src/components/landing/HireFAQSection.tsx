"use client";

/**
 * HireFAQSection — employer-specific FAQ for hire.icareeros.com.
 * Per COWORK-BRIEF-platform-landing-v1.md Task 3.
 */
const FAQS = [
  {
    q: "Q: How are candidates verified?",
    a: "They create an iCareerOS account and opt in to be discoverable. They control their own visibility — no scraping, no purchased lists.",
  },
  {
    q: "Q: Can candidates see who viewed their profile?",
    a: "Not yet. We notify them when an invite is sent.",
  },
  {
    q: "Q: Is there a free tier?",
    a: "Yes. Start hiring free with limited invites per month.",
  },
  {
    q: "Q: What's the difference between this and LinkedIn?",
    a: "iCareerOS candidates are actively managing their career goals — they're motivated, not passive. And they opted in specifically to be found.",
  },
];

export function HireFAQSection() {
  return (
    <section className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, textAlign:"center", marginBottom:"3rem", color:"var(--neutral-900)" }}>Common Questions</h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"2rem" }}>
          {FAQS.map(f => (
            <div key={f.q} style={{
              background:"var(--neutral-100)", border:"1px solid var(--neutral-300)",
              borderRadius:"1rem", padding:"2rem", transition:"all 0.3s",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="#00B8A9"; el.style.boxShadow="0 8px 20px rgba(0,184,169,0.10)"; }}
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
