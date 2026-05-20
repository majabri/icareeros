"use client";
import { useEffect, useRef } from "react";
import {
  IconReportAnalytics,
  IconUserCheck,
  IconAdjustmentsHorizontal,
  IconSend,
  IconBuilding,
  type Icon,
} from "@tabler/icons-react";

/**
 * HireFeaturesSection — 5-feature block for hire.icareeros.com.
 * Per COWORK-BRIEF-platform-landing-v1.md Task 3.
 */
const FEATURES: Array<{ Icon: Icon; title: string; desc: string }> = [
  {
    Icon: IconReportAnalytics,
    title: "AI JD Analysis",
    desc:  "Paste a job description, get instant fit scoring against your candidate pool.",
  },
  {
    Icon: IconUserCheck,
    title: "Verified Talent Pool",
    desc:  "Every candidate opted in to be discovered. No scraping, no cold lists.",
  },
  {
    Icon: IconAdjustmentsHorizontal,
    title: "Smart Filters",
    desc:  "Filter by role, location, experience level, and remote preference.",
  },
  {
    Icon: IconSend,
    title: "Direct Invites",
    desc:  "Reach candidates in-app; track sent invites and responses.",
  },
  {
    Icon: IconBuilding,
    title: "Company Profile",
    desc:  "Build your employer brand — candidates see who's reaching out.",
  },
];

export function HireFeaturesSection() {
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
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Built for modern hiring teams
        </h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3rem", maxWidth:600, margin:"0 auto 3rem", textAlign:"center" }}>
          Everything you need to source, screen, and reach verified talent.
        </p>

        <div className="hire-features-grid" style={{ display:"grid", gap:"2rem", marginTop:"3rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, desc }) => (
            <div key={title} className="fade-in" style={{
              background:"var(--neutral-100)", padding:"3rem 2.5rem", borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)", transition:"all 0.3s", textAlign:"left",
            }}>
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
      <style>{`
        .hire-features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .hire-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1024px) {
          .hire-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
