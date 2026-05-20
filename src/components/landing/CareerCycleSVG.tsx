"use client";

/**
 * CareerCycleSVG — animated circular 6-stage cycle visualisation.
 *
 * Used on the root landing by both RootJobSeekerSection (#job-seekers)
 * and RootHiringTeamSection (#hiring-teams). Same visual; different
 * stage labels and centre text per caller.
 *
 * Visual:
 *   - 6 numbered nodes evenly placed around a circle (start at top,
 *     clockwise).
 *   - Curved arcs between consecutive nodes with arrowheads showing
 *     the direction of flow.
 *   - A dashed background ring rotates slowly to convey continuous
 *     motion.
 *   - Each node pulses gently, staggered, so the cycle reads as "alive".
 *   - Centre badge holds the cycle title + a small ↻ rotating glyph.
 *
 * No external dependencies beyond brand tokens. Animations are CSS
 * keyframes (no JS state) so it stays cheap to render on the landing.
 */

type Stage = {
  /** Stage number, 1-indexed, shown as the big numeral inside each node. */
  n:     number;
  /** Short stage label rendered just outside the node. */
  label: string;
};

export function CareerCycleSVG({
  stages,
  centerLabel,
}: {
  stages:      Stage[];
  centerLabel: string;
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
    const shrink = nodeR + 4;
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
    <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>
      <svg
        viewBox="0 0 500 500"
        width="100%"
        height="auto"
        role="img"
        aria-label={`Six-stage ${centerLabel} cycle`}
        style={{ display: "block" }}
      >
        <defs>
          <marker
            id="cycle-arrow"
            markerWidth="9"
            markerHeight="9"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 6 3, 0 6" fill="#00B8A9" />
          </marker>

          <radialGradient id="cycle-node-grad" cx="50%" cy="40%" r="60%">
            <stop offset="0%"   stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="rgba(0,184,169,0.10)" />
          </radialGradient>

          <filter id="cycle-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00B8A9" floodOpacity="0.20" />
          </filter>
        </defs>

        {/* Background rotating dashed ring — pure CSS keyframe. */}
        <g style={{
          transformOrigin: `${cx}px ${cy}px`,
          animation: "career-cycle-spin 60s linear infinite",
        }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(0,184,169,0.25)"
            strokeWidth="1.5"
            strokeDasharray="6 8"
          />
        </g>

        {/* Connecting arcs — drawn under the nodes so node circles overlap edges. */}
        {stages.map((_, i) => {
          const next = (i + 1) % stages.length;
          return (
            <path
              key={`arc-${i}`}
              d={arcPath(i, next)}
              fill="none"
              stroke="#00B8A9"
              strokeWidth="1.5"
              strokeOpacity="0.55"
              markerEnd="url(#cycle-arrow)"
            />
          );
        })}

        {/* Centre badge — title + tiny rotating ↻ underneath */}
        <g>
          <circle cx={cx} cy={cy} r="62" fill="#FFFFFF" stroke="rgba(0,184,169,0.20)" strokeWidth="1" />
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

        {/* Stage nodes — number + outer label */}
        {stages.map((s, i) => {
          const p = positions[i];

          // Label position — push slightly outside the node along the
          // radial outward vector so labels don't overlap the ring.
          const outX = cx + (r + 56) * Math.cos(p.angle);
          const outY = cy + (r + 56) * Math.sin(p.angle);

          return (
            <g key={`node-${s.n}`}>
              {/* Pulse animation circle — sits behind the node. */}
              <circle
                cx={p.x}
                cy={p.y}
                r={nodeR + 6}
                fill="rgba(0,184,169,0.10)"
                style={{
                  transformOrigin: `${p.x}px ${p.y}px`,
                  animation: "career-cycle-pulse 4s ease-in-out infinite",
                  animationDelay: `${i * 0.65}s`,
                }}
              />

              <circle
                cx={p.x}
                cy={p.y}
                r={nodeR}
                fill="url(#cycle-node-grad)"
                stroke="#00B8A9"
                strokeWidth="2"
                filter="url(#cycle-soft-shadow)"
              />
              <text
                x={p.x}
                y={p.y + 7}
                textAnchor="middle"
                fontSize="22"
                fontWeight="800"
                fill="#00B8A9"
              >
                {s.n}
              </text>

              {/* Outer label */}
              <text
                x={outX}
                y={outY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="13"
                fontWeight="700"
                fill="#0F1B2D"
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
          @keyframes career-cycle-pulse {
            0%, 100% { opacity: 0.45; transform: scale(1); }
            50%      { opacity: 1;    transform: scale(1.08); }
          }
        `}</style>
      </svg>
    </div>
  );
}
