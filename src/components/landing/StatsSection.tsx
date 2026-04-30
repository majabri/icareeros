"use client";
import { useEffect, useRef } from "react";

const STATS = [
  { n:"92%",  label:"Report increased confidence in career decisions" },
  { n:"3.5x", label:"Faster path to landing target role" },
  { n:"50K+", label:"Career transformations supported" },
  { n:"4.9/5",label:"Rating from career seekers" },
];

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="stats" style={{
      padding:"6rem 3rem", textAlign:"center",
      background:"linear-gradient(135deg,var(--primary) 0%,var(--secondary) 50%,var(--tertiary) 100%)",
      color:"var(--neutral-100)",
    }}>
      <div ref={ref} style={{ maxWidth:1200, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-100)" }}>Real Results, Real People</h2>
        <p style={{ fontSize:"1.1rem", color:"rgba(255,255,255,0.9)", marginBottom:"4rem" }}>Join thousands transforming their careers</p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))", gap:"3rem" }}>
          {STATS.map(s => (
            <div key={s.n} className="fade-in" style={{ textAlign:"center" }}>
              <div style={{ fontSize:"3rem", fontWeight:800, marginBottom:"0.5rem", textShadow:"0 2px 4px rgba(0,0,0,0.1)" }}>{s.n}</div>
              <div style={{ fontSize:"1rem", opacity:0.95 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
