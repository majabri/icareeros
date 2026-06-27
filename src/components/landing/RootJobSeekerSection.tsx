"use client";
import {
  IconCompass, IconTarget, IconBooks, IconSearch, IconMicrophone, IconTrophy,
  IconChartBar, IconRoute, IconMessageCircle,
  IconFileText, IconScale, IconX,
  type Icon,
} from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";
import { CareerCycleSVG, STAGE_COLORS } from "./CareerCycleSVG";
import { useCycleRotation } from "./useCycleRotation";

/**
 * RootJobSeekerSection — #job-seekers section on icareeros.com.
 *
 * Sprint Platform-Closure 2026-05-22:
 *   - Eyebrow: Title Case ("For Job Seekers")
 *   - Five stage CARDS in a 3-column grid (number / icon / headline / body) — Coach folded into Advise per 5-stage refactor (PR #310)
 *   - Section heading + subhead + loop caption per brief
 *   - 5 feature cards (was 6)
 *   - Section-end CTA
 *   - Cycle SVG retained above the stage grid as a supporting visual
 */

type Stage = {
  n: number;
  label: string;
  Icon: Icon;
  headline: string;
  body: string;
  /** Loop-reset card — rendered with subtle teal tint instead of full stage treatment. */
  variant?: "loop-reset";
};

const STAGES: readonly Stage[] = [
  { n: 1, label: "Evaluate", Icon: IconCompass,
    headline: "Where you actually stand",
    body: "Skills assessment, market fit analysis, gap identification against real job descriptions. An honest baseline — including how your resume scores before you apply anywhere." },
  { n: 2, label: "Advise",   Icon: IconTarget,
    headline: "What to do about it",
    body: "Resume analysis against real JDs. Fit scores before you apply. AI coaching to help you target roles where you're genuinely competitive — not just interested." },
  { n: 3, label: "Learn",    Icon: IconBooks,
    headline: "Close the gaps that matter",
    body: "Personalised skill-building paths built from your gaps, your target roles, and your timeline." },
  { n: 4, label: "Act",      Icon: IconSearch,
    headline: "Apply with precision, not volume",
    body: "AI-drafted applications tailored per role. Tracked pipeline. Outreach templates. Apply to fewer roles, better — and know exactly where each application stands." },
  { n: 5, label: "Achieve",  Icon: IconTrophy,
    headline: "Land the role. Start the loop again.",
    body: "Role-specific interview prep. Offer analysis and salary benchmarks. Milestone tracking. Land knowing you were ready — then reset for the next goal." },
  { n: 6, label: "↻ The loop resets", Icon: IconTrophy,
    headline: "New goal. New gaps. Next level.",
    body: "iCareerOS doesn't stop when you land. It resets for your next career milestone — whether that's a promotion, a pivot, or a bigger role at a better company.",
    variant: "loop-reset" },
] as const;

type Pain = { text: string; tag?: string };
const PAINS: readonly Pain[] = [
  { text: "Rewriting your resume for every application, from scratch" },
  { text: "Applying into silence — no feedback, no signal on why you were rejected" },
  { text: "No idea which skills are actually holding you back from the roles you want" },
  { text: "Interview prep happens the night before, if at all" },
  { text: "Offers arrive with no context on whether they're fair" },
  { text: "The cycle repeats for the next role, just as chaotic" },
  { text: "AI is now screening your resume before a human ever reads it — and most job seekers have no idea how to optimize for it", tag: "2026" },
];

const FEATURES: Array<{ Icon: Icon; title: string; body: string }> = [
  { Icon: IconFileText, title: "Resume that adapts",
    body: "Tailored to each role — keeping what's strong, adjusting what matters for the JD. ATS-optimized automatically so it gets read before it gets filtered." },
  { Icon: IconChartBar, title: "Fit score before you apply",
    body: "See how well you match a role before spending two hours on the application. Apply where you're actually competitive — skip where you're not." },
  { Icon: IconRoute, title: "Your path, not a generic plan",
    body: "Skill gaps identified from your actual target roles — not a course catalogue." },
  { Icon: IconMessageCircle, title: "Interview prep that knows the role",
    body: "Questions built for the specific role and company you're targeting. Not generic drills — practice that maps to the actual interview you'll have." },
  { Icon: IconScale, title: "Offer context before you sign",
    body: "Salary benchmarks, negotiation framing, what to ask for and how. Know if the number on the table is fair before you respond." },
  { Icon: IconMessageCircle, title: "AI coach on demand",
    body: "Ask career questions, get a coaching brief, or practise for an interview — any time. No scheduling. No waiting. Built into the Advise stage." },
];

const FAQ_ITEMS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Is iCareerOS actually free?",
    a: "Yes. The free plan includes all five stages — Evaluate, Advise, Learn, Act, and Achieve. You can run a complete job search cycle without paying anything. Paid plans add higher usage limits, priority access to new features, and advanced AI coaching sessions.",
  },
  {
    q: "How is this different from LinkedIn or a job board?",
    a: "Job boards give you a list of openings. iCareerOS gives you a system. It evaluates your fit before you apply, tailors your resume for each role, builds your skills to match your targets, preps you for the interview, and benchmarks the offer. It runs continuously — not just when you remember to log in.",
  },
  {
    q: "Does it work if I'm not actively job searching right now?",
    a: "Yes — and that's when it's most useful. The Evaluate and Learn stages work best when you're not under pressure. Building your baseline and closing skill gaps before you need to search puts you months ahead when you do. The loop resets for your next role whenever you're ready.",
  },
  {
    q: "What does the AI actually do — and what does it not do?",
    a: "The AI handles the mechanics: resume tailoring, fit scoring, skill gap analysis, interview question generation, and offer benchmarking. It does not apply for you, attend interviews for you, or guarantee outcomes. You still have to show up and perform — the system makes sure you do it prepared.",
  },
];

// Per-stage dwell (ms). 2s for stages 1-4, 5s pause on stage 5 (Achieve).
const STAGE_DURATIONS_MS = [2000, 2000, 2000, 2000, 5000] as const;

export function RootJobSeekerSection() {
  const { current: currentStage, setCurrent, setPaused } = useCycleRotation(
    STAGES.filter(s => s.variant !== "loop-reset").length,
    STAGE_DURATIONS_MS,
  );

  return (
    <section
      id="job-seekers"
      className="landing-fade-bg"
      style={{
        padding: "4rem 3rem",
        background: "linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Heading block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ color: BRAND_COLORS.teal, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            For Job Seekers
          </div>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 800, marginBottom: "1.1rem", color: "var(--neutral-900)", lineHeight: 1.15 }}>
            Your career doesn&rsquo;t need more advice. It needs a system.
          </h2>
          <p style={{ fontSize: "1.1rem", color: "var(--neutral-700)", maxWidth: 780, margin: "0 auto", lineHeight: 1.7 }}>
            iCareerOS runs a continuous five-stage loop — from
            Evaluate to Achieve — handling resume tailoring, fit
            scoring, skill gap analysis, interview prep, and offer
            benchmarking. So you can focus on the one thing no AI can
            do: showing up prepared and performing.
          </p>
          <p style={{ fontSize: "11.5px", color: BRAND_COLORS.slateBlue, marginTop: "0.6rem" }}>
            No credit card required. Free plan includes all five stages.
          </p>
        </div>

        {/* Pain section */}
        <div style={{ maxWidth: 760, margin: "0 auto 4rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--neutral-900)", textAlign: "center" }}>
            The way most people job search is broken.
          </h3>
          <p style={{ fontSize: "0.88rem", color: BRAND_COLORS.slateBlue, marginBottom: "1.25rem", fontStyle: "italic", textAlign: "center" }}>
            Not because they&rsquo;re doing it wrong. Because there&rsquo;s no system connecting the pieces.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {PAINS.map(p => (
              <div
                key={p.text}
                style={{
                  fontSize: "1rem",
                  color: "var(--neutral-800)",
                  paddingLeft: "2.5rem",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "0.1rem",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "9999px",
                    background: "rgba(255, 107, 107, 0.12)",
                    color: BRAND_COLORS.coral,
                  }}
                >
                  <IconX size={16} stroke={1.5} />
                </span>
                <span>
                  {p.tag && (
                    <span style={{
                      display: "inline-block",
                      fontSize: "10px",
                      fontWeight: 700,
                      background: "rgba(255,107,107,0.12)",
                      color: BRAND_COLORS.coral,
                      border: "1px solid rgba(255,107,107,0.25)",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      marginRight: "6px",
                      verticalAlign: "middle",
                    }}>{p.tag}</span>
                  )}
                  {p.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stages — heading + subhead + supporting cycle SVG + 3-column grid */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", marginBottom: "0.6rem" }}>
            Five stages. One continuous loop. Real outcomes.
          </h3>
          <p style={{ fontSize: "1rem", color: "var(--neutral-700)", maxWidth: 720, margin: "0 auto", lineHeight: 1.65 }}>
            Each stage feeds the next. The system runs until you land
            — then resets for your next goal. No starting over from
            scratch.
          </p>
        </div>

        {/* Supporting cycle SVG above the grid (preserves PR #270-#272 cycle work) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          <CareerCycleSVG
            centerLabel="iCareerOS"
            stages={STAGES.filter(s => s.variant !== "loop-reset").map(s => ({ n: s.n, label: s.label }))}
            currentStage={currentStage}
          />
        </div>

        {/* 3-column stage card grid */}
        <div className="root-js-stage-grid" style={{ display: "grid", gap: "1.25rem", marginBottom: "1.25rem" }}>
          {STAGES.map(({ n, label, Icon: StageIcon, headline, body, variant }, i) => {
            const isLoopReset = variant === "loop-reset";
            const isActive = !isLoopReset && i === currentStage;
            const stageColor = isLoopReset ? BRAND_COLORS.teal : STAGE_COLORS[i];
            const stageNumber = isLoopReset ? "↻" : String(n).padStart(2, "0");
            return (
              <button
                key={n}
                type="button"
                onClick={() => { if (!isLoopReset) setCurrent(i); }}
                aria-pressed={isActive}
                disabled={isLoopReset}
                style={{
                  position: "relative",
                  background: isLoopReset
                    ? "rgba(0,184,169,0.04)"
                    : (isActive ? `${stageColor}10` : "var(--neutral-100)"),
                  border: isLoopReset
                    ? "1px solid rgba(0,184,169,0.25)"
                    : `1px solid ${isActive ? stageColor : "var(--neutral-300)"}`,
                  borderTop: `3px solid ${stageColor}`,
                  borderRadius: "1rem",
                  padding: "1.6rem 1.4rem 1.4rem",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 400ms ease, border-color 400ms ease, transform 400ms ease",
                  transform: isActive ? "translateY(-2px)" : "translateY(0)",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                {/* Large faded stage number in the corner */}
                <div aria-hidden style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "1rem",
                  fontSize: "3rem",
                  fontWeight: 800,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: `${stageColor}1A`,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  pointerEvents: "none",
                }}>
                  {stageNumber}
                </div>
                <div style={{
                  width: 44, height: 44,
                  background: `${stageColor}1A`,
                  borderRadius: "0.65rem",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "1rem",
                }}>
                  <StageIcon size={20} stroke={1.5} color={stageColor} />
                </div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: stageColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.35rem" }}>
                  {isLoopReset ? label : `Stage ${n} · ${label}`}
                </div>
                <h4 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--neutral-900)", marginBottom: "0.5rem", lineHeight: 1.3 }}>
                  {headline}
                </h4>
                <p style={{ fontSize: "0.95rem", color: "var(--neutral-700)", lineHeight: 1.6 }}>
                  {body}
                </p>
              </button>
            );
          })}
        </div>

        {/* Loop caption */}
        <p style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--neutral-700)", marginBottom: "4rem", fontStyle: "italic" }}>
          ↻ After Achieve, the cycle resets — new goal, new gaps, next level.
        </p>

        {/* Features grid */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2rem" }}>
          Built for the full search. Not just one part of it.
        </h3>
        <div className="root-js-features-grid" style={{ display: "grid", gap: "1.5rem", marginBottom: "3rem" }}>
          {FEATURES.map(({ Icon: FeatureIcon, title, body }) => (
            <div key={title} style={{
              background: "var(--neutral-100)",
              padding: "2rem 1.75rem",
              borderRadius: "1.25rem",
              border: "1px solid var(--neutral-300)",
              textAlign: "left",
            }}>
              <div style={{
                width: 48, height: 48,
                background: "rgba(0,184,169,0.10)",
                borderRadius: "0.75rem",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "1.1rem",
              }}>
                <FeatureIcon size={20} stroke={1.5} color={BRAND_COLORS.teal} />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.55rem", color: "var(--neutral-900)" }}>{title}</h4>
              <p style={{ color: "var(--neutral-700)", fontSize: "0.97rem", lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>

        {/* FAQ section — added 2026-06-26 per Strategy v2 brief */}
        <h3 style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--neutral-900)", textAlign: "center", marginBottom: "2rem", marginTop: "3rem" }}>
          Common questions.
        </h3>
        <div style={{ maxWidth: 780, margin: "0 auto 4rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {FAQ_ITEMS.map(({ q, a }) => (
            <details
              key={q}
              style={{
                background: "var(--neutral-100)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "0.75rem",
                padding: "0",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  padding: "1rem 1.25rem",
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  fontSize: "1rem",
                  listStyle: "none",
                }}
              >
                {q}
              </summary>
              <div style={{
                padding: "0 1.25rem 1.25rem",
                color: "var(--neutral-700)",
                fontSize: "0.97rem",
                lineHeight: 1.65,
              }}>
                {a}
              </div>
            </details>
          ))}
        </div>

        {/* Section CTA — heading + subtext + button + trust line */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--neutral-900)", marginBottom: "0.75rem" }}>
            Ready to run your career like a system?
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--neutral-700)", maxWidth: 620, margin: "0 auto 1.75rem", lineHeight: 1.6 }}>
            Five stages. One loop. Runs until you land — then resets for the next goal. Free to start.
          </p>
          <a
            href="https://icareeros.com/auth/signup?role=job_seeker"
            className="btn btn-primary"
            style={{
              display: "inline-block",
              padding: "0.85rem 1.6rem",
              borderRadius: "0.6rem",
              background: BRAND_COLORS.teal,
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start your career OS — it&rsquo;s free →
          </a>
          <p style={{ fontSize: "11.5px", color: BRAND_COLORS.slateBlue, marginTop: "0.6rem", textAlign: "center" }}>
            No credit card. All five stages on the free plan. Cancel any time.
          </p>
        </div>
      </div>

      <style>{`
        .root-js-stage-grid    { grid-template-columns: 1fr; }
        .root-js-features-grid { grid-template-columns: 1fr; }
        @media (min-width: 768px) {
          .root-js-stage-grid    { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .root-js-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1100px) {
          .root-js-stage-grid    { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .root-js-features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
