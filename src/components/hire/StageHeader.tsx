/**
 * StageHeader — stage identity bar shown at the top of every stage page.
 *
 * Layout (per COWORK-BRIEF-hire-pathway-shell-v2 Item 4):
 *   [icon] [number]  [label]                  [status badge]
 *          [tagline]
 *
 * Status badge rules (Sprint H1 simplification — full plan-aware check
 * ships in H2):
 *   - status === "live"                                  → green   "Live"
 *   - billing === "starter"                              → amber   "Starter+"
 *   - status === "planned" && billing === "free"         → slate   "Coming Soon"
 *
 * Server component — no client interactivity needed; the page renders
 * this once at request time and the data comes from PATHWAY_STAGES.
 */

import { getStage, type StageId } from "@/lib/hire/pathway-stages";

export interface StageHeaderProps {
  stageId:           StageId;
  showBillingBadge?: boolean;
}

function badge(label: string, fg: string, bg: string, border: string) {
  return (
    <span
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        fontSize:     "0.7rem",
        fontWeight:   700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color:        fg,
        background:   bg,
        border:       `1px solid ${border}`,
        padding:      "0.2rem 0.6rem",
        borderRadius: 999,
        lineHeight:   1,
      }}
    >
      {label}
    </span>
  );
}

export function StageHeader({ stageId, showBillingBadge = true }: StageHeaderProps) {
  const stage = getStage(stageId);
  if (!stage) return null;

  let badgeNode: React.ReactNode = null;
  if (showBillingBadge) {
    if (stage.status === "live") {
      badgeNode = badge("Live", "#065F46", "#D1FAE5", "#A7F3D0");
    } else if (stage.billing === "starter") {
      badgeNode = badge("Starter+", "#92400E", "#FEF3C7", "#FDE68A");
    } else {
      badgeNode = badge("Coming Soon", "#475569", "#F1F5F9", "#CBD5E1");
    }
  }

  return (
    <header
      style={{
        display:        "flex",
        alignItems:     "flex-start",
        gap:            "1rem",
        paddingBottom:  "1.25rem",
        borderBottom:   "1px solid var(--surface-border, #E5E7EB)",
        marginBottom:   "1.5rem",
      }}
    >
      {/* Icon block — stage colour as tinted square background. */}
      <span
        aria-hidden="true"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          48,
          height:         48,
          borderRadius:   12,
          background:     `${stage.color}1A`, // ~10% tint
          color:          stage.color,
          fontSize:       "1.6rem",
          flexShrink:     0,
        }}
      >
        {stage.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span style={{
            fontFamily:    "Inter, system-ui, sans-serif",
            fontSize:      "0.85rem",
            fontWeight:    700,
            letterSpacing: "0.08em",
            color:         stage.color,
          }}>
            {stage.number}
          </span>
          <h1 style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize:   "1.5rem",
            fontWeight: 700,
            color:      "var(--text-primary, #0F1B2D)",
            margin:     0,
          }}>
            {stage.label}
          </h1>
          {badgeNode}
        </div>
        <p style={{
          marginTop:  "0.35rem",
          fontSize:   "0.95rem",
          color:      "var(--text-muted, #64748B)",
          lineHeight: 1.5,
        }}>
          {stage.tagline}
        </p>
      </div>
    </header>
  );
}

export default StageHeader;
