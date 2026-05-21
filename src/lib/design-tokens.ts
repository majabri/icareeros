/**
 * iCareerOS Global Design Tokens
 *
 * Single source of truth for brand colors, stage colors, icon defaults,
 * and shared visual values. Import from here — never hardcode hex
 * values in components.
 *
 * Last updated: 2026-05-21
 */

// ── Brand color palette ──────────────────────────────────────────────
export const BRAND_COLORS = {
  // Primary
  teal:       "#00B8A9", // primary brand color
  tealLight:  "#40C9C0", // light teal / achieve stage

  // Accent
  coral:      "#FF6B6B", // accent / error / pain points
  gold:       "#F5A623", // highlight / learn stage
  green:      "#10B981", // success / act stage
  slateBlue:  "#7B9AC0", // muted / coach stage

  // Base
  navy:       "#0F1B2D", // dark background

  // Semantic aliases
  primary:    "#00B8A9",
  error:      "#FF6B6B",
  success:    "#10B981",
  warning:    "#F5A623",
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;

// ── Stage colors ─────────────────────────────────────────────────────
// Two shapes for two consumption patterns:
//
//   STAGE_COLORS_ORDERED — positional array. Used by the landing
//     CareerCycleSVG and its sibling cards (`STAGE_COLORS[i]`).
//
//   STAGE_COLORS_MAP — keyed by CareerOsStage slug. Used by the
//     dashboard ring, sidebar, and stage cards (`STAGE_COLORS[stage]`).
//
// Both have identical values and order — keep them in sync.

export const STAGE_COLORS_ORDERED = [
  "#00B8A9", // 1 — Evaluate (teal)
  "#FF6B6B", // 2 — Advise   (coral)
  "#F5A623", // 3 — Learn    (gold)
  "#10B981", // 4 — Act      (green)
  "#7B9AC0", // 5 — Coach    (slate blue)
  "#40C9C0", // 6 — Achieve  (light teal)
] as const;

export const STAGE_COLORS_MAP = {
  evaluate: "#00B8A9",
  advise:   "#FF6B6B",
  learn:    "#F5A623",
  act:      "#10B981",
  coach:    "#7B9AC0",
  achieve:  "#40C9C0",
} as const;

// ── Icon defaults ────────────────────────────────────────────────────
export const ICON_DEFAULTS = {
  size:        20,
  sizeInline:  16,
  strokeWidth: 1.5,
  color:       "#00B8A9",
} as const;

export const ICON_CONTAINER = {
  size:       48,
  background: "rgba(0,184,169,0.10)",
  radius:     8,
} as const;

export const PAIN_ICON = {
  size:       16,
  color:      "#FF6B6B",
  background: "rgba(255,107,107,0.10)",
} as const;
