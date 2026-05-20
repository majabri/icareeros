"use client";
import { useEffect, useRef } from "react";
import {
  IconBrain, IconShieldCheck, IconAdjustments, IconMailForward, IconBuilding,
  type Icon,
} from "@tabler/icons-react";

/**
 * HireFeaturesSection — five employer features.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2 — "Everything
 * you need. Nothing you don't."
 */
const FEATURES: Array<{ Icon: Icon; title: string; desc: string }> = [
  { Icon: IconBrain, title: "AI JD Analysis",
    desc: "Paste a job description. Get instant fit scoring against your candidate pool. Know who to talk to before you start talking." },
  { Icon: IconShieldCheck, title: "Verified, opt-in candidates",
    desc: "No scraped profiles. No cold lists. Every candidate created an account and chose to be found — which means they're actually looking." },
  { Icon: IconAdjustments, title: "Filters that matter",
    desc: "Role, location, experience level, remote preference. Filter to the candidates who match your actual requirements — not keyword guesses." },
  { Icon: IconMailForward, title: "Direct in-app invites",
    desc: "Reach candidates where they're managing their job search. Track invite status. Know who's engaged and who isn't." },
  { Icon: IconBuilding, title: "Company profile",
    desc: "Show candidates who you are before they decide whether to respond. Culture, mission, open roles — in one employer page." },
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
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"3rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Everything you need. Nothing you don&rsquo;t.
        </h2>

        <div className="hire-features-grid" style={{ display:"grid", gap:"2rem" }}>
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
