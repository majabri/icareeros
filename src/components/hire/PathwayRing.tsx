"use client";

/**
 * PathwayRing — iCareerOS People Retention Pathway circular ring.
 *
 * Six-segment SVG ring matching the visual structure of
 * `src/components/landing/CareerCycleSVG.tsx` (read-only reference per
 * COWORK-BRIEF-hire-pathway-shell-v2). Same 6 colours in the same
 * positions as the iCareerOS career-cycle ring — only the stage labels
 * differ.
 *
 * Props:
 *   activeStageId  Optional. When supplied, that node is full-opacity
 *                  + a halo; other nodes drop to 40% opacity. When
 *                  omitted, all six nodes render at full opacity (used
 *                  on the iCareerOS Dashboard overview page where no
 *                  single stage is "active").
 *                  Note: jobs.* CareerOsRing always receives a current
 *                  stage (from cycle.current_stage), so there is no
 *                  existing precedent to mirror for the no-active
 *                  case. Optional + undefined is the cleanest TS fit.
 *
 * Locked-icon overlay: stages whose billing tier is `starter` render
 * a small lock glyph in the node. Per Sprint H1 simplification this
 * is unconditional — full plan-aware check ships in H2.
 *
 * Clicking any segment navigates to `stage.route` (clean URL, the
 * middleware will rewrite into /hire/... internally).
 */

import { useRouter } from "next/navigation";
import { PATHWAY_STAGES, type StageId } from "@/lib/hire/pathway-stages";
import { BRAND_COLORS } from "@/lib/design-tokens";

const CX     = 250;
const CY     = 250;
const RADIUS = 175;
const NODE_R = 32;

function nodePosition(i: number, total: number) {
  // Match CareerCycleSVG: start at -90deg (12 o'clock), evenly spaced.
  const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x:     CX + RADIUS * Math.cos(angle),
    y:     CY + RADIUS * Math.sin(angle),
    angle,
  };
}

function arcPath(from: number, to: number, total: number): string {
  const a = nodePosition(from, total);
  const b = nodePosition(to,   total);
  const largeArc = 0;
  const sweep    = 1;
  return `M ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} ${sweep} ${b.x} ${b.y}`;
}

export interface PathwayRingProps {
  activeStageId?: StageId;
  className?:     string;
}

export function PathwayRing({ activeStageId, className }: PathwayRingProps) {
  const router = useRouter();
  const stages = PATHWAY_STAGES;

  return (
    <svg
      viewBox="0 0 500 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="iCareerOS People Retention Pathway"
      className={className}
      style={{ width: "100%", maxWidth: 500, height: "auto" }}
    >
      {/* Connecting arcs — each arc N→N+1 wears stage N's colour. */}
      {stages.map((stage, i) => {
        const next      = (i + 1) % stages.length;
        const path      = arcPath(i, next, stages.length);
        const isActive  = activeStageId === stage.id;
        const inactiveDim = activeStageId !== undefined && !isActive;
        return (
          <path
            key={`arc-${stage.id}`}
            d={path}
            fill="none"
            stroke={stage.color}
            strokeWidth={isActive ? 4 : 2.5}
            strokeLinecap="round"
            opacity={inactiveDim ? 0.4 : 1}
          />
        );
      })}

      {/* Centre badge — iCareerOS wordmark, matches CareerCycleSVG centre treatment. */}
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="22"
        fontWeight="800"
        fill={BRAND_COLORS.navy}
        letterSpacing="-0.5"
      >
        iCareerOS
      </text>
      <text
        x={CX}
        y={CY + 16}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="10"
        fontWeight="600"
        fill="#64748B"
        letterSpacing="0.1em"
      >
        PATHWAY
      </text>

      {/* Stage nodes. */}
      {stages.map((stage, i) => {
        const pos         = nodePosition(i, stages.length);
        const isActive    = activeStageId === stage.id;
        const inactiveDim = activeStageId !== undefined && !isActive;
        const isLocked    = stage.billing === "starter";

        return (
          <g
            key={`node-${stage.id}`}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={{ cursor: "pointer" }}
            onClick={() => router.push(stage.route)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(stage.route);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${stage.number} ${stage.label}: ${stage.tagline}`}
            opacity={inactiveDim ? 0.4 : 1}
          >
            {/* Background fill — active = colour, inactive = white with coloured ring. */}
            <circle
              r={NODE_R}
              fill={isActive ? stage.color : "#ffffff"}
              stroke={stage.color}
              strokeWidth={isActive ? 3 : 2.5}
            />
            {/* Active halo pulse — purely visual. */}
            {isActive && (
              <circle
                r={NODE_R + 6}
                fill="none"
                stroke={stage.color}
                strokeWidth={2}
                opacity={0.5}
              />
            )}
            {/* Stage number. */}
            <text
              y={4}
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="14"
              fontWeight="800"
              fill={isActive ? "#ffffff" : stage.color}
            >
              {stage.number}
            </text>
            {/* Lock glyph (small, lower-right). */}
            {isLocked && (
              <text
                x={NODE_R - 4}
                y={NODE_R - 4}
                textAnchor="middle"
                fontSize="13"
                aria-hidden="true"
              >
                {"\u{1F512}"}
              </text>
            )}
            {/* Outer label below the node. */}
            <text
              y={NODE_R + 22}
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="13"
              fontWeight={isActive ? 800 : 600}
              fill={isActive ? stage.color : BRAND_COLORS.navy}
            >
              {stage.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default PathwayRing;
