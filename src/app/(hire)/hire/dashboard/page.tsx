/**
 * /dashboard on hire.icareeros.com — iCareerOS Dashboard overview.
 *
 * Sprint H1 (COWORK-BRIEF-hire-pathway-shell-v2): the dashboard becomes
 * the People Retention Pathway overview, NOT the candidate search.
 * CandidateSearch migrated to /select in this sprint.
 *
 * Layout:
 *   [PathwayRing — all 6 segments full-opacity, no active stage]
 *   [Six-card grid — stage icon · number · label · tagline · status badge]
 *
 * Clicking any ring segment OR card navigates to that stage's route.
 *
 * Convention note (per ADR-HIRE-001 v3 follow-up): jobs.* `CareerOsRing`
 * always receives a `current_stage` from the cycle row — there is no
 * existing "no active stage" precedent in jobs.*. PathwayRing makes
 * the `activeStageId` prop optional with `undefined` meaning "no
 * highlight" so the overview shows all 6 segments equally.
 */

import Link from "next/link";
import { PathwayRing } from "@/components/hire/PathwayRing";
import { PATHWAY_STAGES, type PathwayStage } from "@/lib/hire/pathway-stages";
import { BRAND_COLORS } from "@/lib/design-tokens";

function statusBadge(stage: PathwayStage): { label: string; fg: string; bg: string } {
  if (stage.status === "live") {
    return { label: "Live",        fg: "#065F46", bg: "#D1FAE5" };
  }
  if (stage.billing === "starter") {
    return { label: "Starter+",    fg: "#92400E", bg: "#FEF3C7" };
  }
  return { label: "Coming Soon", fg: "#475569", bg: "#F1F5F9" };
}

export default function HireDashboardOverviewPage() {
  return (
    <div
      style={{
        maxWidth: 1080,
        margin:   "0 auto",
        padding:  "2.5rem 1.5rem 4rem",
      }}
    >
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize:   "1.85rem",
            fontWeight: 800,
            color:      `var(--text-primary, ${BRAND_COLORS.navy})`,
            margin:     0,
          }}
        >
          iCareerOS Dashboard
        </h1>
        <p
          style={{
            margin:     "0.5rem auto 0",
            maxWidth:   620,
            fontSize:   "1rem",
            color:      "var(--text-muted, #64748B)",
            lineHeight: 1.55,
          }}
        >
          Your six-stage People Retention Pathway. Move from defining the
          role through hiring, onboarding, supporting, developing, and
          retaining your team — all in one operating system.
        </p>
      </header>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem" }}>
        <PathwayRing />
      </div>

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap:                 "1rem",
        }}
      >
        {PATHWAY_STAGES.map((stage) => {
          const badge = statusBadge(stage);
          return (
            <Link
              key={stage.id}
              href={stage.route}
              style={{
                display:        "block",
                textDecoration: "none",
                background:     "var(--surface-card, #FFFFFF)",
                border:         `1px solid ${stage.color}33`,
                borderLeft:     `4px solid ${stage.color}`,
                borderRadius:   12,
                padding:        "1.1rem 1.25rem",
                transition:     "transform 120ms ease, box-shadow 120ms ease",
                color:          "inherit",
              }}
            >
              <div
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display:        "inline-flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    width:          36,
                    height:         36,
                    borderRadius:   10,
                    background:     `${stage.color}1A`,
                    color:          stage.color,
                    fontSize:       "1.2rem",
                    flexShrink:     0,
                  }}
                >
                  {stage.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize:      "0.72rem",
                    fontWeight:    700,
                    letterSpacing: "0.06em",
                    color:         stage.color,
                  }}>
                    {stage.number}
                  </div>
                  <div style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize:   "1.05rem",
                    fontWeight: 700,
                    color:      `var(--text-primary, ${BRAND_COLORS.navy})`,
                  }}>
                    {stage.label}
                  </div>
                </div>
                <span
                  style={{
                    fontSize:      "0.65rem",
                    fontWeight:    700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color:         badge.fg,
                    background:    badge.bg,
                    padding:       "0.18rem 0.55rem",
                    borderRadius:  999,
                    whiteSpace:    "nowrap",
                  }}
                >
                  {badge.label}
                </span>
              </div>
              <p style={{
                margin:     0,
                fontSize:   "0.88rem",
                color:      "var(--text-muted, #64748B)",
                lineHeight: 1.5,
              }}>
                {stage.tagline}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
