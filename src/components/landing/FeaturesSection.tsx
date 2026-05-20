"use client";
import { useEffect, useRef } from "react";
import {
  IconCompass,
  IconTarget,
  IconBooks,
  IconUsers,
  IconTrendingUp,
  IconRefresh,
  type Icon,
} from "@tabler/icons-react";

const FEATURES: Array<{ Icon: Icon; title: string; desc: string }> = [
  { Icon: IconCompass,    title: "Career Clarity",   desc: "Advanced assessments reveal your strengths and potential paths. No guessing, just clarity." },
  { Icon: IconTarget,     title: "Smart Matching",   desc: "Find roles and growth opportunities aligned with your goals, not just keyword matches." },
  { Icon: IconBooks,      title: "Learning Paths",   desc: "Personalized skill-building journeys designed just for you. Learn what matters." },
  { Icon: IconUsers,      title: "Real Mentorship",  desc: "Connect with mentors who've walked your path. Get advice from people who understand." },
  { Icon: IconTrendingUp, title: "Progress Tracking",desc: "Watch your growth unfold. Visual milestones keep you motivated and on track." },
  { Icon: IconRefresh,    title: "Continuous Growth",desc: "Your career never stops evolving. iCareerOS grows with you every step of the way." },
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
    <section id="features" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)" }}>
      <div ref={ref} style={{ maxWidth:1400, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>Designed to Help You Succeed</h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3rem", maxWidth:600, margin:"0 auto 3rem", textAlign:"center" }}>
          Tools built specifically for career growth at every stage
        </p>

        <div className="features-grid" style={{ display:"grid", gap:"2rem", marginTop:"3rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, desc }) => (
            <div key={title} className="fade-in" style={{
              background:"var(--neutral-100)", padding:"3rem 2.5rem", borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)", transition:"all 0.3s", textAlign:"left",
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor="#00B8A9"; el.style.boxShadow="0 15px 40px rgba(0,184,169,0.12)"; el.style.transform="translateY(-8px)"; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor="var(--neutral-300)"; el.style.boxShadow=""; el.style.transform=""; }}>
              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.5rem",
              }}>
                <FeatureIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h3 style={{ fontSize:"1.35rem", fontWeight:700, marginBottom:"0.85rem", color:"var(--neutral-900)" }}>{title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.7 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop.
          Replaces the previous auto-fit minmax(320px,1fr) which laid out
          4+2 on a 1280px container (Amir 2026-05-11). */}
      <style>{`
        .features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1024px) {
          .features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
