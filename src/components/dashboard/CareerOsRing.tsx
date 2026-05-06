"use client";

/**
 * CareerOsRing — six-stage circular progress display for /dashboard.
 *
 * Renders Evaluate → Advise → Learn → Act → Coach → Achieve as nodes around
 * a circle. Each node shows status + name + click-to-act CTA when incomplete.
 *
 * Strict completion rule (per COWORK-BRIEF-phase1-v1.md, Sub-item 2a):
 *   A stage with NULL or empty `notes` is NEVER `completed`. The parent
 *   component is responsible for computing `status` from `(cycle, notes)`
 *   honestly. This component just renders what it's given.
 *
 * Styling: Tailwind core classes only — no shadcn or new dep introduced.
 */

import { useId } from "react";
import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

export type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "coach", "achieve",
];

const STAGE_LABELS: Record<CareerOsStage, string> = {
  evaluate: "Evaluate",
  advise:   "Advise",
  learn:    "Learn",
  act:      "Act",
  coach:    "Coach",
  achieve:  "Achieve",
};

const STATUS_NODE_CLASS: Record<StageStatus, string> = {
  pending:     "fill-gray-100 stroke-gray-300",
  in_progress: "fill-amber-100 stroke-amber-500",
  completed:   "fill-emerald-100 stroke-emerald-600",
  skipped:     "fill-gray-50 stroke-gray-200",
};

const STATUS_LABEL_CLASS: Record<StageStatus, string> = {
  pending:     "text-gray-500",
  in_progress: "text-amber-700 font-semibold",
  completed:   "text-emerald-700 font-semibold",
  skipped:     "text-gray-400",
};

interface RingNode {
  stage:    CareerOsStage;
  status:   StageStatus;
  /**
   * Notes are non-empty for this stage. Forwarded for the optional CTA: a
   * past stage with empty notes can still be re-runnable.
   */
  hasNotes: boolean;
}

export interface CareerOsRingProps {
  stages:        RingNode[];
  currentStage?: CareerOsStage;
  /**
   * Called when a stage node is clicked. Parent decides what action to
   * take — typically: run-stage if `stage === currentStage` and not
   * completed, otherwise navigate / show notes.
   */
  onStageClick?: (stage: CareerOsStage) => void;
  className?:    string;
}

export function CareerOsRing({
  stages, currentStage, onStageClick, className,
}: CareerOsRingProps) {
  const titleId = useId();

  // SVG geometry — 360x360 viewBox, ring radius 140, node radius 32.
  const cx = 180;
  const cy = 180;
  const ringR  = 140;
  const nodeR  = 32;
  // Lift the first node to 12 o'clock and rotate clockwise.
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / STAGE_ORDER.length;

  // Order incoming stages to match canonical STAGE_ORDER so callers can
  // pass them in any order.
  const stageMap = new Map(stages.map(s => [s.stage, s]));
  const ordered  = STAGE_ORDER.map(s =>
    stageMap.get(s) ?? { stage: s, status: "pending" as StageStatus, hasNotes: false }
  );

  // Connector arc colour: derive from last completed stage.
  const lastCompletedIdx = ordered.reduce(
    (acc, n, i) => (n.status === "completed" ? i : acc),
    -1,
  );

  return (
    <figure
      className={"flex flex-col items-center gap-3 " + (className ?? "")}
      aria-labelledby={titleId}
    >
      <figcaption id={titleId} className="sr-only">
        Career OS six-stage progress ring
      </figcaption>

      <svg
        viewBox="0 0 360 360"
        className="w-full max-w-[360px]"
        role="img"
        aria-label="Six-stage career operating system progress"
      >
        {/* Inner connector ring — light track */}
        <circle cx={cx} cy={cy} r={ringR}
                fill="none" stroke="currentColor"
                className="text-gray-200" strokeWidth={2} />

        {/* Connector arcs between completed stages — emerald progress track */}
        {ordered.map((node, i) => {
          if (i > lastCompletedIdx) return null;
          const a1 = angleFor(i);
          const a2 = angleFor((i + 1) % STAGE_ORDER.length);
          const x1 = cx + ringR * Math.cos(a1);
          const y1 = cy + ringR * Math.sin(a1);
          const x2 = cx + ringR * Math.cos(a2);
          const y2 = cy + ringR * Math.sin(a2);
          // Skip the wrap-around segment (achieve → evaluate).
          if (i + 1 >= STAGE_ORDER.length) return null;
          const sweep = (a2 > a1) ? 1 : 0;
          return (
            <path
              key={`arc-${node.stage}`}
              d={`M ${x1} ${y1} A ${ringR} ${ringR} 0 0 ${sweep} ${x2} ${y2}`}
              fill="none"
              className="stroke-emerald-500"
              strokeWidth={3}
            />
          );
        })}

        {/* Stage nodes */}
        {ordered.map((node, i) => {
          const a = angleFor(i);
          const x = cx + ringR * Math.cos(a);
          const y = cy + ringR * Math.sin(a);
          const isCurrent = node.stage === currentStage;
          const labelOffset = nodeR + 16;
          const lx = cx + (ringR + labelOffset) * Math.cos(a);
          const ly = cy + (ringR + labelOffset) * Math.sin(a);
          const labelAnchor = lx > cx + 5 ? "start" : lx < cx - 5 ? "end" : "middle";

          return (
            <g key={node.stage}>
              {/* Outer ring on the current stage to highlight it */}
              {isCurrent && (
                <circle cx={x} cy={y} r={nodeR + 6}
                        fill="none" className="stroke-amber-400 animate-pulse"
                        strokeWidth={2} />
              )}

              {/* Clickable node */}
              <g
                onClick={() => onStageClick?.(node.stage)}
                className={onStageClick ? "cursor-pointer" : ""}
                role={onStageClick ? "button" : undefined}
                tabIndex={onStageClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onStageClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onStageClick(node.stage);
                  }
                }}
                aria-label={`${STAGE_LABELS[node.stage]} — ${node.status.replace("_", " ")}`}
              >
                <circle
                  cx={x} cy={y} r={nodeR}
                  className={STATUS_NODE_CLASS[node.status]}
                  strokeWidth={2}
                />

                {/* Status glyph in the centre */}
                {node.status === "completed" ? (
                  <path
                    d={`M ${x - 10} ${y} l 7 7 l 14 -14`}
                    fill="none"
                    className="stroke-emerald-700"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : node.status === "in_progress" ? (
                  <circle cx={x} cy={y} r={6} className="fill-amber-500" />
                ) : (
                  <text
                    x={x} y={y} dy=".35em"
                    textAnchor="middle"
                    className="fill-gray-400 text-xs font-semibold"
                  >
                    {i + 1}
                  </text>
                )}
              </g>

              {/* External label */}
              <text
                x={lx} y={ly} dy=".35em"
                textAnchor={labelAnchor}
                className={"text-sm " + STATUS_LABEL_CLASS[node.status]}
              >
                {STAGE_LABELS[node.stage]}
              </text>
            </g>
          );
        })}

        {/* Centre summary — what's the current stage in plain English */}
        <text x={cx} y={cy - 6} textAnchor="middle"
              className="fill-gray-500 text-xs uppercase tracking-wider">
          Current stage
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
              className="fill-gray-900 text-base font-semibold">
          {currentStage ? STAGE_LABELS[currentStage] : "—"}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          in progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          pending
        </span>
      </div>
    </figure>
  );
}
