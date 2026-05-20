"use client";

/**
 * CareerCycleSVG — animated circular 6-stage cycle visualisation.
 *
 * Per-stage colors (Amir 2026-05-20) — every node and every connecting
 * arc carries its own brand-palette color, so the cycle reads as a
 * full color-rotation rather than a single-tone ring:
 *
 *   stage 1 — teal       #00B8A9
 *   stage 2 — gold       #F5A623
 *   stage 3 — green      #10B981
 *   stage 4 — coral      #FF6B6B
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

/** Default 6-stage color palette — drawn from the iCareerOS logo SVGs. */
export const STAGE_COLORS = [
  "#00B8A9", // 1 — Teal (brand primary)
  "#F5A623", // 2 — Gold
  "#10B981", // 3 — Green
  "#FF6B6B", // 4 — Coral
  "#7B9AC0", // 5 — Slate blue
  "#40C9C0", // 6 — Light teal
] as const;

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
        aria-label={`Six-stage ${centerLabel} cycle`}
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
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F1B2D" floodOpacity="0.12" />
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
          const color = stageColors[i] ?? "#00B8A9";
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
            fill="#0F1B2D"
          >
            {centerLabel}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="#00B8A9"
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
              fill="#00B8A9"
            >
              ↻
            </text>
          </g>
        </g>

        {/* Stage nodes — color-rotating ring */}
        {stages.map((s, i) => {
          const p = positions[i];
          const color = stageColors[i] ?? "#00B8A9";
          const isActive = i === currentStage;

          // Label position — push slightly outside the node along the
          // radial outward vector so labels don't overlap the ring.
          const outX = cx + (r + 56) * Math.cos(p.angle);
          const outY = cy + (r + 56) * Math.sin(p.angle);

          return (
            <g key={`node-${s.n}`}>
              {/* Pulse halo behind the node — only when active. */}
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
                fill={isActive ? color : "#0F1B2D"}
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
