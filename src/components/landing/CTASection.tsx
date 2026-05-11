"use client";
export function CTASection() {
  return (
    <section id="cta" className="landing-fade-bg" style={{ padding:"5rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)", textAlign:"center" }}>
      <div className="landing-cta-card" style={{
        maxWidth:700, margin:"0 auto", background:"var(--landing-cta-bg, var(--neutral-100))",
        padding:"4rem", borderRadius:"2rem", border:"2px solid var(--landing-cta-border, var(--neutral-300))",
        boxShadow:"0 10px 40px rgba(0,217,255,0.1)", transition:"all 0.3s",
      }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="var(--primary)"; el.style.boxShadow="0 20px 60px rgba(0,217,255,0.15)"; }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor="var(--landing-cta-border, var(--neutral-300))"; el.style.boxShadow="0 10px 40px rgba(0,217,255,0.1)"; }}>
        <h2 style={{ fontSize:"2rem", marginBottom:"1rem", color:"var(--text-primary, var(--neutral-900))" }}>Ready to Transform Your Career?</h2>
        <p style={{ fontSize:"1.1rem", marginBottom:"2rem", color:"var(--text-secondary, var(--neutral-700))" }}>
          Start your journey today. No credit card required. No pressure. Just possibility.
        </p>
        <a href="/auth/signup" className="btn btn-primary">Begin Your Free Career Assessment</a>
      </div>
    </section>
  );
}
