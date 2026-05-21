"use client";

/**
 * StageLocked — Starter+ billing-gate placeholder.
 *
 * Rendered on Integrate / Support / Develop / Retain stage pages.
 * Per ADR-HIRE-001 v3 locked decision #5, these four stages are
 * Starter+ only. Free-plan employers see this placeholder; clicking
 * the Upgrade CTA navigates to /settings/billing.
 *
 * NOT rendered for the Design stage — Design is billing=free but
 * status=planned. Use DesignComingSoon (or a simple "Coming Soon"
 * card without the Upgrade CTA) for that stage.
 *
 * Visual style: stage colour as the identity, ~8% tint background,
 * coloured icon container + heading. Inviting, not punishing — no
 * grey-overlay treatment.
 */

import Link from "next/link";
import { getStage, STAGE_DETAILS, type StageId } from "@/lib/hire/pathway-stages";

export interface StageLockedProps {
  stageId: StageId;
}

export function StageLocked({ stageId }: StageLockedProps) {
  const stage  = getStage(stageId);
  const detail = STAGE_DETAILS[stageId];
  if (!stage) return null;

  return (
    <section
      aria-label={`${stage.label} — Starter+ upgrade required`}
      style={{
        background:   `${stage.color}14`,        // ~8% opacity tint
        border:       `1px solid ${stage.color}33`, // ~20% opacity edge
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
            Unlock {stage.label} with Starter
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
          What you&apos;ll unlock
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

      <Link
        href="/settings/billing"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            "0.4rem",
          marginTop:      "1.5rem",
          background:     stage.color,
          color:          "#FFFFFF",
          fontWeight:     700,
          fontSize:       "0.95rem",
          padding:        "0.6rem 1.25rem",
          borderRadius:   10,
          textDecoration: "none",
        }}
      >
        Upgrade to Starter →
      </Link>
    </section>
  );
}

export default StageLocked;
