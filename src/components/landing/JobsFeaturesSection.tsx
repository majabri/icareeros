"use client";
import { useEffect, useRef } from "react";
import {
  IconFileText, IconChartBar, IconRoute, IconMessageCircle, IconScale,
  type Icon,
} from "@tabler/icons-react";

/**
 * JobsFeaturesSection — five job-seeker features.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 1 — "Built for the
 * full search. Not just one part of it."
 */
const FEATURES: Array<{ Icon: Icon; title: string; desc: string }> = [
  { Icon: IconFileText, title: "Resume that adapts",
    desc: "Your resume isn't static. iCareerOS tailors it to each role — keeping what's strong, adjusting what matters for the JD." },
  { Icon: IconChartBar, title: "Fit score before you apply",
    desc: "See how well you match a role before spending two hours on the application. Apply where it counts." },
  { Icon: IconRoute, title: "Your path, not a generic plan",
    desc: "Skill gaps identified from your actual target roles — not a course catalogue. Learn what moves the needle." },
  { Icon: IconMessageCircle, title: "Interview prep that knows the role",
    desc: "Practice with questions built for the specific role and company you're targeting — not generic \"tell me about yourself\" drills." },
  { Icon: IconScale, title: "Offer context before you sign",
    desc: "Know whether what's on the table is fair. Salary benchmarks, negotiation framing, what to ask for and how." },
];

export function JobsFeaturesSection() {
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
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"3rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Built for the full search. Not just one part of it.
        </h2>

        <div className="jobs-features-grid" style={{ display:"grid", gap:"2rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, desc }) => (
            <div key={title} className="fade-in" style={{
              background:"var(--neutral-100)", padding:"2.5rem 2.25rem", borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)", transition:"all 0.3s", textAlign:"left",
            }}>
              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.25rem",
              }}>
                <FeatureIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h3 style={{ fontSize:"1.25rem", fontWeight:700, marginBottom:"0.65rem", color:"var(--neutral-900)" }}>{title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.65 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .jobs-features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .jobs-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1024px) {
          .jobs-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
