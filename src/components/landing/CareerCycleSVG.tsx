"use client";

/**
 * CareerCycleSVG — animated circular 6-stage cycle visualisation.
 *
 * Used on the root landing by both RootJobSeekerSection (#job-seekers)
 * and RootHiringTeamSection (#hiring-teams). Same visual; different
 * stage labels and centre text per caller.
 *
 * Synchronised highlight (added 2026-05-20, per Amir):
 *   - The parent section drives a `currentStage` counter (auto-advance
 *     every 3s, paused on hover) and passes it in as a prop.
 *   - The SVG highlights node N (larger pulse + brighter fill +
 *     drop-shadow glow) so the visitor's eye is led around the loop.
 *   - The parent section uses the same currentStage to highlight the
 *     matching description card — circle and copy breathe in sync.
 *
 * The background dashed ring still rotates continuously regardless of
 * `currentStage` so the cycle reads as alive even when the user pauses
 * the auto-advance.
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
  currentStage,
}: {
  stages:        Stage[];
  centerLabel:   string;
  /** 0-indexed currently-highlighted stage. Defaults to no highlight. */
  currentStage?: number;
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

          <radialGradient id="cycle-node-grad-active" cx="50%" cy="40%" r="60%">
            <stop offset="0%"   stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="rgba(0,184,169,0.45)" />
          </radialGradient>

          <filter id="cycle-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00B8A9" floodOpacity="0.20" />
          </filter>

          <filter id="cycle-active-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00B8A9" floodOpacity="0.55" />
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

        {/* Connecting arcs — highlight the arc leaving the active node */}
        {stages.map((_, i) => {
          const next = (i + 1) % stages.length;
          const isActive = i === currentStage;
          return (
            <path
              key={`arc-${i}`}
              d={arcPath(i, next)}
              fill="none"
              stroke="#00B8A9"
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeOpacity={isActive ? 1 : 0.55}
              markerEnd="url(#cycle-arrow)"
              style={{ transition: "stroke-width 600ms ease, stroke-opacity 600ms ease" }}
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
          const isActive = i === currentStage;

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
                fill={isActive ? "rgba(0,184,169,0.30)" : "rgba(0,184,169,0.10)"}
                style={{
                  transformOrigin: `${p.x}px ${p.y}px`,
                  animation: isActive
                    ? "career-cycle-active-pulse 1.6s ease-in-out infinite"
                    : "career-cycle-pulse 4s ease-in-out infinite",
                  animationDelay: isActive ? "0s" : `${i * 0.65}s`,
                  transition: "fill 400ms ease",
                }}
              />

              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? nodeR + 2 : nodeR}
                fill={isActive ? "url(#cycle-node-grad-active)" : "url(#cycle-node-grad)"}
                stroke="#00B8A9"
                strokeWidth={isActive ? 3 : 2}
                filter={isActive ? "url(#cycle-active-glow)" : "url(#cycle-soft-shadow)"}
                style={{ transition: "r 400ms ease, stroke-width 400ms ease" }}
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
                fontWeight={isActive ? 800 : 700}
                fill={isActive ? "#00B8A9" : "#0F1B2D"}
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
          @keyframes career-cycle-pulse {
            0%, 100% { opacity: 0.45; transform: scale(1); }
            50%      { opacity: 1;    transform: scale(1.08); }
          }
          @keyframes career-cycle-active-pulse {
            0%, 100% { opacity: 0.75; transform: scale(1); }
            50%      { opacity: 1;    transform: scale(1.18); }
          }
          @media (prefers-reduced-motion: reduce) {
            [class*="career-cycle"], svg [style*="career-cycle"] {
              animation: none !important;
            }
          }
        `}</style>
      </svg>
    </div>
  );
}
