"use client";
import { useEffect, useRef } from "react";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  type Icon,
} from "@tabler/icons-react";

/**
 * JobsStagesSection — the six career OS stages.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 1 — "The six stages".
 */
const STAGES: Array<{ n: string; Icon: Icon; title: string; headline: string; body: string }> = [
  { n: "1", Icon: IconCompass,    title: "Evaluate", headline: "Where you actually stand",
    body: "Skills assessment, market fit analysis, gap identification. An honest baseline before you make a move." },
  { n: "2", Icon: IconTarget,     title: "Advise",   headline: "What to do about it",
    body: "Resume analysis against real JDs. Fit scores before you apply. Know which roles are worth your time." },
  { n: "3", Icon: IconBooks,      title: "Learn",    headline: "Close the gaps that matter",
    body: "Personalised skill-building paths built from your gaps, your target roles, and your timeline. Not generic courses." },
  { n: "4", Icon: IconSearch,     title: "Act",      headline: "Apply with precision, not volume",
    body: "AI-drafted applications tailored per role. Tracked pipeline. Outreach templates. Apply smarter, not more." },
  { n: "5", Icon: IconMicrophone, title: "Coach",    headline: "Prepare like you have inside information",
    body: "Role-specific interview prep, negotiation coaching, offer review. Know what to say and what to ask for." },
  { n: "6", Icon: IconTrophy,     title: "Achieve",  headline: "Land the role. Start the loop again.",
    body: "Offer management, milestone tracking, and a reset for your next goal — because careers don't stop." },
];

export function JobsStagesSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1, rootMargin: "0px 0px -80px 0px" });
    ref.current?.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="stages" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div ref={ref} style={{ maxWidth:1200, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Six stages. One continuous loop. Real outcomes.
        </h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3.5rem", maxWidth:740, margin:"0 auto 3.5rem", textAlign:"center", lineHeight:1.6 }}>
          Unlike one-time tools, iCareerOS keeps running — each stage feeding
          the next, until you hit your goal. Then it resets for the next one.
        </p>

        <div className="stages-grid" style={{ display:"grid", gap:"1.5rem" }}>
          {STAGES.map(({ n, Icon: StageIcon, title, headline, body }) => (
            <div key={n} className="fade-in" style={{
              background:"var(--neutral-100)",
              padding:"2.25rem 2rem",
              borderRadius:"1.25rem",
              border:"1px solid var(--neutral-300)",
              transition:"all 0.3s",
              textAlign:"left",
              position:"relative",
            }}>
              {/* Stage number — large visual anchor */}
              <div style={{
                position:"absolute",
                top:"1rem", right:"1.25rem",
                fontSize:"3.5rem", fontWeight:800,
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
                <StageIcon size={20} stroke={1.5} color="#00B8A9" />
              </div>

              <div style={{ fontSize:"0.85rem", fontWeight:600, color:"#00B8A9", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"0.4rem" }}>
                Stage {n} · {title}
              </div>
              <h3 style={{ fontSize:"1.25rem", fontWeight:700, marginBottom:"0.65rem", color:"var(--neutral-900)" }}>{headline}</h3>
              <p style={{ color:"var(--neutral-700)", fontSize:"0.98rem", lineHeight:1.6 }}>{body}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign:"center", marginTop:"2.5rem", fontSize:"0.95rem", color:"var(--neutral-700)" }}>
          ↻ After Achieve, the cycle resets — new goal, new gaps, next level.
        </p>
      </div>

      <style>{`
        .stages-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .stages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1024px) {
          .stages-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
