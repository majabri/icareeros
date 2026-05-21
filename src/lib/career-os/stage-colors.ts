/**
 * Career-OS per-stage color palette.
 *
 * Mirrors the platform-wide palette established in
 * `src/components/landing/CareerCycleSVG.tsx` so the dashboard ring,
 * sidebar, and stage cards all read with the same identity colors as
 * the landing page's animated cycle.
 *
 * Stage colors are not "theme tokens" — they identify a stage by
 * meaning (Evaluate is teal, Advise is coral, etc.) and stay constant
 * across light and dark themes.
 *
 * If the landing palette ever changes, update both this file and the
 * landing source in the same PR (cross-domain shared identity).
 */

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

export const STAGE_COLORS: Record<CareerOsStage, string> = {
  evaluate: "#00B8A9", // 1 — Teal (brand primary)
  advise:   "#FF6B6B", // 2 — Coral
  learn:    "#F5A623", // 3 — Gold
  act:      "#10B981", // 4 — Green
  coach:    "#7B9AC0", // 5 — Slate blue
  achieve:  "#40C9C0", // 6 — Light teal
} as const;

/**
 * Hex with low-opacity overlay, suitable for tinted backgrounds behind
 * the colored text (e.g. active-stage row background). Uses 8-digit
 * hex (RRGGBBAA) — 0x1A ≈ 10% opacity.
 */
export function stageTint(stage: CareerOsStage): string {
  return STAGE_COLORS[stage] + "1A";
}
