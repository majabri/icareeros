"use client";
import { useEffect, useRef } from "react";

const FEATURES = [
  { icon:"🧭", title:"Career Clarity",      desc:"Advanced assessments reveal your strengths and potential paths. No guessing, just clarity." },
  { icon:"🎯", title:"Smart Matching",       desc:"Find roles and growth opportunities aligned with your goals, not just keyword matches." },
  { icon:"📚", title:"Learning Paths",       desc:"Personalized skill-building journeys designed just for you. Learn what matters." },
  { icon:"👥", title:"Real Mentorship",      desc:"Connect with mentors who've walked your path. Get advice from people who understand." },
  { icon:"📈", title:"Progress Tracking",    desc:"Watch your growth unfold. Visual milestones keep you motivated and on track." },
  { icon:"🔄", title:"Continuous Growth",    desc:"Your career never stops evolving. iCareerOS grows with you every step of the way." },
];

export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)" }}>
      <div ref={ref} style={{ maxWidth:1400, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>Designed to Help You Succeed</h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3rem", maxWidth:600, margin:"0 auto 3rem", textAlign:"center" }}>
          Tools built specifically for career growth at every stage
        </p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))", gap:"2.5rem", marginTop:"3rem" }}>
          {FEATURES.map(f => (
            <div key={f.title} className="fade-in" style={{
              background:"var(--neutral-100)", padding:"2.5rem", borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)", transition:"all 0.3s", textAlign:"left",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="var(--primary)"; el.style.boxShadow="0 15px 40px rgba(0,217,255,0.12)"; el.style.transform="translateY(-8px)"; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor="var(--neutral-300)"; el.style.boxShadow=""; el.style.transform=""; }}>
              <div style={{
                width:70, height:70, background:"linear-gradient(135deg,var(--primary) 0%,var(--tertiary) 100%)",
                borderRadius:"1rem", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"2rem", marginBottom:"1.5rem", boxShadow:"0 4px 15px rgba(0,217,255,0.15)",
              }}>{f.icon}</div>
              <h3 style={{ fontSize:"1.2rem", marginBottom:"0.75rem", color:"var(--neutral-900)" }}>{f.title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"0.95rem", lineHeight:1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
