"use client";

/**
 * StageComingSoon — placeholder for Free-plan stages that aren't built
 * yet. Used by the Design stage (billing=free, status=planned).
 *
 * Per directive 2026-05-21 from strategy chat: do NOT render the
 * Upgrade CTA for free stages. A simple card with the stage description
 * and a "This stage is coming soon" line is enough. The user already
 * has access; the feature just isn't shipped yet.
 *
 * For Starter+ stages (Integrate / Support / Develop / Retain) use
 * StageLocked instead — that surfaces the Upgrade CTA.
 */

import { getStage, STAGE_DETAILS, type StageId } from "@/lib/hire/pathway-stages";

export interface StageComingSoonProps {
  stageId: StageId;
}

export function StageComingSoon({ stageId }: StageComingSoonProps) {
  const stage  = getStage(stageId);
  const detail = STAGE_DETAILS[stageId];
  if (!stage) return null;

  return (
    <section
      aria-label={`${stage.label} — coming soon`}
      style={{
        background:   `${stage.color}14`,
        border:       `1px solid ${stage.color}33`,
        borderRadius: 16,
        padding:      "2rem",
        maxWidth:     720,
      }}
    >
      <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
        <span
          aria-hidden="true"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          56,
            height:         56,
            borderRadius:   14,
            background:     `${stage.color}26`,
            color:          stage.color,
            fontSize:       "1.9rem",
            flexShrink:     0,
          }}
        >
          {stage.icon}
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin:     0,
            fontSize:   "1.25rem",
            fontWeight: 800,
            color:      stage.color,
          }}>
            {stage.label} is coming soon
          </h2>
          <p style={{
            margin:     "0.5rem 0 0",
            fontSize:   "0.95rem",
            color:      "var(--text-primary, #0F1B2D)",
            lineHeight: 1.55,
          }}>
            {detail.description}
          </p>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <h3 style={{
          fontSize:   "0.85rem",
          fontWeight: 700,
          color:      "var(--text-muted, #475569)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin:     "0 0 0.5rem",
        }}>
          When it ships, you&apos;ll get
        </h3>
        <ul style={{
          margin:     0,
          padding:    0,
          listStyle:  "none",
          display:    "grid",
          gap:        "0.4rem",
        }}>
          {detail.actions.map((action) => (
            <li
              key={action}
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        "0.55rem",
                fontSize:   "0.95rem",
                color:      "var(--text-primary, #0F1B2D)",
              }}
            >
              <span aria-hidden="true" style={{ color: stage.color, fontWeight: 800 }}>
                ›
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>

      <p style={{
        marginTop: "1.5rem",
        fontSize:  "0.8rem",
        color:     "var(--text-muted, #64748B)",
        fontStyle: "italic",
      }}>
        Included with every iTalentOS plan — no upgrade needed.
      </p>
    </section>
  );
}

export default StageComingSoon;
