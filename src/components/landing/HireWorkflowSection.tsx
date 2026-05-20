"use client";
import { useEffect, useRef } from "react";
import { IconClipboardList, IconUsers, IconSend, type Icon } from "@tabler/icons-react";

/**
 * HireWorkflowSection — three-step workflow for hire.icareeros.com.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2 — "The employer
 * workflow". Replaces the earlier HireHowItWorksSection (PR #263).
 */
const STEPS: Array<{ n: string; Icon: Icon; title: string; body: string }> = [
  {
    n: "1", Icon: IconClipboardList,
    title: "Post a role or paste a JD",
    body:  "Drop in a job description. iCareerOS analyses it and scores your candidate pool for fit — before you review a single profile.",
  },
  {
    n: "2", Icon: IconUsers,
    title: "Search verified, opt-in talent",
    body:  "Filter by role, location, experience level, and remote preference. Every candidate you see chose to be discoverable.",
  },
  {
    n: "3", Icon: IconSend,
    title: "Reach out directly, in-app",
    body:  "Send invites directly. Track who's seen your message, who's responded, who's interested. No cold lists. No guessing.",
  },
];

export function HireWorkflowSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="workflow" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div ref={ref} style={{ maxWidth:1200, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"3rem", color:"var(--neutral-900)", textAlign:"center" }}>
          A hiring workflow built around candidates who are ready.
        </h2>

        <div className="hire-steps-grid" style={{ display:"grid", gap:"2rem" }}>
          {STEPS.map(({ n, Icon: StepIcon, title, body }) => (
            <div key={n} className="fade-in" style={{
              background:"var(--neutral-100)",
              padding:"2.5rem 2.25rem",
              borderRadius:"1.5rem",
              border:"1px solid var(--neutral-300)",
              transition:"all 0.3s",
              textAlign:"left",
              position:"relative",
            }}>
              {/* Large step number as visual anchor */}
              <div style={{
                position:"absolute",
                top:"1rem", right:"1.25rem",
                fontSize:"4rem", fontWeight:800,
                color:"rgba(0,184,169,0.12)",
                lineHeight:1,
              }}>{n}</div>

              <div style={{
                width:48, height:48,
                background:"rgba(0,184,169,0.10)",
                borderRadius:"0.75rem",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:"1.25rem",
              }}>
                <StepIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>

              <h3 style={{ fontSize:"1.25rem", fontWeight:700, marginBottom:"0.65rem", color:"var(--neutral-900)" }}>{title}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"1rem", lineHeight:1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .hire-steps-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .hire-steps-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
