"use client";

import { STAGE_COLORS_ORDERED, BRAND_COLORS } from "@/lib/design-tokens";

/**
 * CareerCycleSVG — animated circular cycle visualisation, data-driven
 * by the length of the `stages` prop (jobs.* drives a 5-element career
 * loop; hire.* drives the People Retention Pathway). Positions auto-
 * compute around the ring at 360/N degrees apart.
 *
 * Per-stage colors (Amir 2026-05-20) — every node and every connecting
 * arc carries its own brand-palette color, so the cycle reads as a
 * full color-rotation rather than a single-tone ring:
 *
 *   stage 1 — teal       #00B8A9
 *   stage 2 — coral      #FF6B6B
 *   stage 3 — gold       #F5A623
 *   stage 4 — green      #10B981
 *   stage 5 — slate blue #7B9AC0
 *   stage 6 — light teal #40C9C0
 *
 * Each arc N→N+1 is colored with stage N's color (the *source* stage),
 * including its arrowhead — so as the highlight advances, the color
 * sweep reads naturally around the ring.
 *
 * The active node fills with its stage color (white text); inactive
 * nodes keep a white fill and stage-colored ring + numeral so the
 * full color story is visible at all times. The active arc bumps its
 * stroke width + opacity.
 *
 * Animations are CSS keyframes only — no JS state in this component.
 * The consumer drives `currentStage` from `useCycleRotation`.
 */

type Stage = {
  /** Stage number, 1-indexed, shown as the big numeral inside each node. */
  n:     number;
  /** Short stage label rendered just outside the node. */
  label: string;
};

/** 6-color brand palette — re-exported from the global
 *  design tokens so landing, dashboard, and sidebar share one source.
 *  See `src/lib/design-tokens.ts` STAGE_COLORS_ORDERED. */
export const STAGE_COLORS = STAGE_COLORS_ORDERED;

export function CareerCycleSVG({
  stages,
  centerLabel,
  currentStage,
  stageColors = STAGE_COLORS,
}: {
  stages:        Stage[];
  centerLabel:   string;
  /** 0-indexed currently-highlighted stage. */
  currentStage?: number;
  /** Override the default per-stage color palette (length must match stages). */
  stageColors?:  readonly string[];
}) {
  const cx = 250;
  const cy = 250;
  const r  = 175;
  const nodeR = 32;

  // Positions for each node — start at top (-90°), then evenly spaced.
  const positions = stages.map((_, i) => {
    const angle = (i / stages.length) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle };
  });

  // Build connecting arc from stage i to stage i+1 (wrapping back to 0).
  function arcPath(from: number, to: number): string {
    const a = positions[from];
    const b = positions[to];
    // Shorten the path so it visually connects between node *edges*,
    // not centres — gives the arrowheads room without overlap.
    const shrink = nodeR + 5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const sx = a.x + (dx / len) * shrink;
    const sy = a.y + (dy / len) * shrink;
    const ex = b.x - (dx / len) * shrink;
    const ey = b.y - (dy / len) * shrink;
    return `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  }

  return (
    <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
      <svg
        viewBox="0 0 500 500"
        width="100%"
        height="auto"
        role="img"
        aria-label={`${stages.length}-stage ${centerLabel} cycle`}
        style={{ display: "block" }}
      >
        <defs>
          {/* One arrowhead marker per stage color — referenced by the
              outgoing arc of that stage. */}
          {stageColors.map((color, i) => (
            <marker
              key={`m-${i}`}
              id={`cycle-arrow-${i}`}
              markerWidth="9"
              markerHeight="9"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon points="0 0, 6 3, 0 6" fill={color} />
            </marker>
          ))}

          {/* Per-stage active-fill radial gradients — slightly lighter
              centre so the active circle has a soft 3D feel. */}
          {stageColors.map((color, i) => (
            <radialGradient key={`g-${i}`} id={`cycle-fill-${i}`} cx="50%" cy="40%" r="60%">
              <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.4" />
              <stop offset="100%" stopColor={color}    stopOpacity="1" />
            </radialGradient>
          ))}

          <filter id="cycle-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={BRAND_COLORS.navy} floodOpacity="0.12" />
          </filter>

          {stageColors.map((color, i) => (
            <filter
              key={`f-${i}`}
              id={`cycle-active-glow-${i}`}
              x="-60%"
              y="-60%"
              width="220%"
              height="220%"
            >
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={color} floodOpacity="0.65" />
            </filter>
          ))}
        </defs>

        {/* Background rotating dashed ring — neutral so it doesn't fight
            the per-stage colors. */}
        <g style={{
          transformOrigin: `${cx}px ${cy}px`,
          animation: "career-cycle-spin 60s linear infinite",
        }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(15, 27, 45, 0.20)"
            strokeWidth="1.5"
            strokeDasharray="6 8"
          />
        </g>

        {/* Connecting arcs — each one in its source stage's color. */}
        {stages.map((_, i) => {
          const next = (i + 1) % stages.length;
          const color = stageColors[i] ?? BRAND_COLORS.teal;
          const isActive = i === currentStage;
          return (
            <path
              key={`arc-${i}`}
              d={arcPath(i, next)}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 3 : 2}
              strokeOpacity={isActive ? 1 : 0.65}
              strokeLinecap="round"
              markerEnd={`url(#cycle-arrow-${i})`}
              style={{ transition: "stroke-width 600ms ease, stroke-opacity 600ms ease" }}
            />
          );
        })}

        {/* Centre badge — title + tiny rotating ↻ */}
        <g>
          <circle cx={cx} cy={cy} r="62" fill="#FFFFFF" stroke="rgba(15,27,45,0.15)" strokeWidth="1" />
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill={BRAND_COLORS.navy}
          >
            {centerLabel}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={BRAND_COLORS.teal}
            letterSpacing="1.5"
          >
            CONTINUOUS LOOP
          </text>
          <g
            style={{
              transformOrigin: `${cx}px ${cy + 30}px`,
              animation: "career-cycle-spin 8s linear infinite",
            }}
          >
            <text
              x={cx}
              y={cy + 34}
              textAnchor="middle"
              fontSize="16"
              fill={BRAND_COLORS.teal}
            >
              ↻
            </text>
          </g>
        </g>

        {/* Stage nodes — color-rotating ring */}
        {stages.map((s, i) => {
          const p = positions[i];
          const color = stageColors[i] ?? BRAND_COLORS.teal;
          const isActive = i === currentStage;

          // Label position — push slightly outside the node along the
          // radial outward vector so labels don't overlap the ring.
          const outX = cx + (r + 56) * Math.cos(p.angle);
          const outY = cy + (r + 56) * Math.sin(p.angle);

          return (
            <g key={`node-${s.n}`}>
              {/* Flash burst — re-triggers via the key prop each time this
                  becomes the active stage. Runs once (~900ms) then disappears. */}
              {isActive && (
                <circle
                  key={`flash-${i}-${currentStage}`}
                  cx={p.x}
                  cy={p.y}
                  r={nodeR + 14}
                  fill={color}
                  opacity={0}
                  style={{
                    transformOrigin: `${p.x}px ${p.y}px`,
                    animation: "career-cycle-flash 900ms ease-out 1 forwards",
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Pulse halo behind the node — continuous gentle pulse
                  while the stage is active (after the flash settles). */}
              {isActive && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={nodeR + 8}
                  fill={color}
                  opacity={0.18}
                  style={{
                    transformOrigin: `${p.x}px ${p.y}px`,
                    animation: "career-cycle-active-pulse 1.6s ease-in-out infinite",
                  }}
                />
              )}

              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? nodeR + 3 : nodeR}
                fill={isActive ? `url(#cycle-fill-${i})` : "#FFFFFF"}
                stroke={color}
                strokeWidth={isActive ? 3 : 2}
                filter={isActive ? `url(#cycle-active-glow-${i})` : "url(#cycle-soft-shadow)"}
                style={{ transition: "r 400ms ease, stroke-width 400ms ease" }}
              />
              <text
                x={p.x}
                y={p.y + 7}
                textAnchor="middle"
                fontSize="22"
                fontWeight="800"
                fill={isActive ? "#FFFFFF" : color}
                style={{ transition: "fill 400ms ease" }}
              >
                {s.n}
              </text>

              {/* Outer label — picks up the stage color when active for
                  a stronger color-reveal as the highlight walks around. */}
              <text
                x={outX}
                y={outY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="13"
                fontWeight={isActive ? 800 : 700}
                fill={isActive ? color : BRAND_COLORS.navy}
                style={{ transition: "fill 400ms ease, font-weight 400ms ease" }}
              >
                {s.label}
              </text>
            </g>
          );
        })}

        <style>{`
          @keyframes career-cycle-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes career-cycle-active-pulse {
            0%, 100% { opacity: 0.18; transform: scale(1); }
            50%      { opacity: 0.45; transform: scale(1.18); }
          }
          /* One-shot 'flash' burst that runs each time the active stage
             changes. The consumer remounts this circle via a React key
             keyed to the current stage so the CSS animation restarts
             from frame 0 on every transition. Brief intense glow +
             scale-up + fade. */
          @keyframes career-cycle-flash {
            0%   { opacity: 0;    transform: scale(0.85); }
            18%  { opacity: 0.85; transform: scale(1.45); }
            55%  { opacity: 0.50; transform: scale(1.25); }
            100% { opacity: 0;    transform: scale(1.15); }
          }
          @media (prefers-reduced-motion: reduce) {
            svg g[style*="career-cycle-spin"],
            svg circle[style*="career-cycle-active-pulse"] {
              animation: none !important;
            }
          }
        `}</style>
      </svg>
    </div>
  );
}
