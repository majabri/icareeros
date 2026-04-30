"use client";
import { useEffect, useRef } from "react";

const STAGES = [
  { n:"1", title:"Evaluate", desc:"Discover your strengths, values, and market position. Get crystal clear on what's next for your career." },
  { n:"2", title:"Advise",   desc:"Receive expert guidance tailored to your unique situation. AI insights + human wisdom = clarity." },
  { n:"3", title:"Learn",    desc:"Master the skills you need. Curated courses, mentorship, and real-world projects — all aligned with your goals." },
  { n:"4", title:"Act",      desc:"Execute with confidence. Land roles, negotiate offers, and launch projects that matter to you." },
  { n:"5", title:"Coach",    desc:"Thrive in your new role. Ongoing support and community keeps you growing and connected." },
  { n:"6", title:"Achieve",  desc:"Celebrate milestones. Then loop back — your next chapter is just beginning." },
];

export function LifecycleSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="lifecycle" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)", textAlign:"center" }}>
      <div ref={ref} style={{ maxWidth:1400, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)" }}>Your 6-Stage Career Journey</h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"4rem", maxWidth:600, marginLeft:"auto", marginRight:"auto" }}>
          A complete system that meets you where you are and guides you where you want to go
        </p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:"2.5rem", marginTop:"4rem" }}>
          {STAGES.map(s => (
            <div key={s.n} className="fade-in" style={{
              padding:"2.5rem", borderRadius:"1.5rem", background:"var(--neutral-100)",
              border:"2px solid var(--neutral-300)", transition:"all 0.3s", position:"relative",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.transform="translateY(-10px)"; el.style.borderColor="var(--primary)"; el.style.boxShadow="0 20px 40px rgba(0,217,255,0.1)"; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform=""; el.style.borderColor="var(--neutral-300)"; el.style.boxShadow=""; }}>
              <div style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                width:60, height:60,
                background:"linear-gradient(135deg,var(--primary) 0%,var(--tertiary) 100%)",
                color:"var(--neutral-100)", borderRadius:"50%", fontWeight:800, fontSize:"1.75rem",
                marginBottom:"1.5rem", boxShadow:"0 4px 15px rgba(0,217,255,0.25)",
              }}>{s.n}</div>
              <h3 style={{ fontSize:"1.4rem", marginBottom:"1rem", color:"var(--neutral-900)" }}>{s.title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"0.95rem", lineHeight:1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
