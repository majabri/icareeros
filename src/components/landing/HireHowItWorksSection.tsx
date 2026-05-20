"use client";
import { useEffect, useRef } from "react";
import { IconFileSearch, IconUsers, IconSend, type Icon } from "@tabler/icons-react";

/**
 * HireHowItWorksSection — 3-step explainer for hire.icareeros.com.
 * Per COWORK-BRIEF-platform-landing-v1.md Task 3.
 */
const STEPS: Array<{ Icon: Icon; title: string; desc: string }> = [
  {
    Icon: IconFileSearch,
    title: "1. Post or paste",
    desc:  "Post your role or paste a JD — AI scores candidate fit instantly against your verified talent pool.",
  },
  {
    Icon: IconUsers,
    title: "2. Search verified candidates",
    desc:  "Filter by role, location, experience, and remote preference. Every candidate opted in to be discovered.",
  },
  {
    Icon: IconSend,
    title: "3. Invite top matches",
    desc:  "Reach out directly in-app — no cold outreach guesswork. Track sent invites and responses.",
  },
];

export function HireHowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="landing-fade-bg" style={{ padding:"5rem 3rem", background:"var(--neutral-100)" }}>
      <div ref={ref} style={{ maxWidth:1100, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>
          How it works
        </h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3rem", textAlign:"center" }}>
          From job description to first invite in under five minutes.
        </p>

        <div style={{
          display:"grid",
          gap:"2rem",
          gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",
        }}>
          {STEPS.map(({ Icon: StepIcon, title, desc }) => (
            <div key={title} className="fade-in" style={{
              background:"var(--neutral-100)", padding:"2.5rem 2rem",
              borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)",
              textAlign:"left", transition:"all 0.3s",
            }}>
              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.25rem",
              }}>
                <StepIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>
              <h3 style={{ fontSize:"1.25rem", fontWeight:700, marginBottom:"0.75rem", color:"var(--neutral-900)" }}>{title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
