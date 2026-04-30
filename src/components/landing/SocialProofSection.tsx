export function SocialProofSection() {
  return (
    <section style={{ padding:"4rem 3rem", background:"var(--neutral-100)", borderBottom:"1px solid var(--neutral-300)", textAlign:"center" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <p style={{ fontSize:"1.2rem", color:"var(--neutral-700)", marginBottom:"2rem", fontWeight:500 }}>
          Trusted by 50,000+ Career Seekers
        </p>

        <div style={{ display:"flex", justifyContent:"center", gap:"3rem", marginBottom:"3rem", flexWrap:"wrap", alignItems:"center", opacity:0.6 }}>
          {["Featured in Top Career Platforms","4.9★ Rated"].map(t => (
            <div key={t} style={{ fontSize:"0.85rem", color:"var(--neutral-700)", padding:"1rem 2rem", border:"1px solid var(--neutral-300)", borderRadius:"0.5rem", background:"var(--neutral-200)" }}>{t}</div>
          ))}
        </div>

        <div style={{ marginBottom:"2rem" }}>
          <div style={{ fontSize:"1.5rem", marginBottom:"0.5rem", letterSpacing:2 }}>⭐⭐⭐⭐⭐</div>
          <div style={{ color:"var(--neutral-700)", fontSize:"0.95rem" }}>4.9/5 average rating from career seekers</div>
        </div>

        <div style={{ maxWidth:600, margin:"0 auto", padding:"2rem", background:"var(--neutral-200)", borderRadius:"1rem", fontSize:"1.05rem", color:"var(--neutral-900)", fontStyle:"italic" }}>
          &ldquo;I landed my target role in 3 weeks. iCareerOS did the heavy lifting while I focused on interview prep.&rdquo;
          <br/>
          <span style={{ color:"var(--primary)", fontWeight:600, fontStyle:"normal" }}>— Sarah M., Senior Product Manager</span>
        </div>
      </div>
    </section>
  );
}
