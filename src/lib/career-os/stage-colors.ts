/**
 * Career-OS per-stage color palette.
 *
 * Re-exported from the global design tokens at `@/lib/design-tokens` so
 * the dashboard ring, sidebar, stage cards, and landing cycle all read
 * from a single source. Stage colors identify a stage by meaning
 * (Evaluate = teal, Advise = coral, etc.) and stay constant across
 * light and dark themes.
 *
 * If the palette ever changes, update `src/lib/design-tokens.ts`. Both
 * `STAGE_COLORS_MAP` (keyed) and `STAGE_COLORS_ORDERED` (positional)
 * live there.
 */

import { STAGE_COLORS_MAP } from "@/lib/design-tokens";
import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

export const STAGE_COLORS: Record<CareerOsStage, string> = STAGE_COLORS_MAP;

/**
 * Hex with low-opacity overlay, suitable for tinted backgrounds behind
 * the colored text (e.g. active-stage row background). Uses 8-digit
 * hex (RRGGBBAA) — 0x1A ≈ 10% opacity.
 */
export function stageTint(stage: CareerOsStage): string {
  return STAGE_COLORS[stage] + "1A";
}
