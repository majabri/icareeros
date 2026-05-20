"use client";

/**
 * HireFAQSection — employer FAQ on hire.icareeros.com.
 * Five Q&As per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2.
 */
const FAQS = [
  {
    q: "How are candidates verified?",
    a: "They create an iCareerOS account and explicitly opt in to be discoverable. They control their own visibility — and can turn it off at any time.",
  },
  {
    q: "Can candidates see who viewed their profile?",
    a: "Candidates are notified when an invite is sent, not when their profile is viewed. You can browse without triggering a notification.",
  },
  {
    q: "What's on the free tier?",
    a: "Free accounts get access to candidate search and a limited number of invites per month. Paid plans include full pipeline management and higher invite volume.",
  },
  {
    q: "How is this different from LinkedIn Recruiter?",
    a: "LinkedIn surfaces people who might be open to a move. iCareerOS surfaces people who are actively managing a job search and have chosen to be found. The intent signal is different — and so is the conversion rate.",
  },
  {
    q: "What happens when a candidate turns off discoverability?",
    a: "They immediately disappear from search results. You won't see them, and any pending outreach is paused. Candidate control is a core part of how the platform works.",
  },
];

export function HireFAQSection() {
  return (
    <section className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, textAlign:"center", marginBottom:"3rem", color:"var(--neutral-900)" }}>
          Common questions.
        </h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
          {FAQS.map(f => (
            <div key={f.q} style={{
              background:"var(--neutral-100)", border:"1px solid var(--neutral-300)",
              borderRadius:"1rem", padding:"2rem", transition:"all 0.3s",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="#00B8A9"; el.style.boxShadow="0 8px 20px rgba(0,184,169,0.10)"; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor="var(--neutral-300)"; el.style.boxShadow=""; }}>
              <div style={{ fontSize:"1.1rem", fontWeight:600, color:"var(--neutral-900)", marginBottom:"0.85rem" }}>{f.q}</div>
              <div style={{ color:"var(--neutral-700)", lineHeight:1.7, fontSize:"0.98rem" }}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
