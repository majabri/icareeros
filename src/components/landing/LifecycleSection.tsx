"use client";

import { useState } from "react";

const STAGES = [
  {
    id: 1,
    label: "Evaluate",
    icon: "🔍",
    color: "from-blue-500 to-blue-600",
    ring: "ring-blue-500",
    description:
      "Assess where you are today — skills, gaps, goals, and market fit. Build a clear picture of your starting point.",
  },
  {
    id: 2,
    label: "Advise",
    icon: "💡",
    color: "from-violet-500 to-violet-600",
    ring: "ring-violet-500",
    description:
      "Get AI-powered strategy and career path recommendations tailored to your profile and target role.",
  },
  {
    id: 3,
    label: "Learn",
    icon: "📚",
    color: "from-emerald-500 to-emerald-600",
    ring: "ring-emerald-500",
    description:
      "Close skill gaps with a curated learning roadmap — certifications, courses, and hands-on projects.",
  },
  {
    id: 4,
    label: "Act",
    icon: "🚀",
    color: "from-amber-500 to-amber-600",
    ring: "ring-amber-500",
    description:
      "Apply, network, build experience. Turn strategy into real-world action with accountability built in.",
  },
  {
    id: 5,
    label: "Coach",
    icon: "🤝",
    color: "from-pink-500 to-pink-600",
    ring: "ring-pink-500",
    description:
      "Continuous feedback and optimization — resume tweaks, interview prep, and performance improvement.",
  },
  {
    id: 6,
    label: "Achieve",
    icon: "🏆",
    color: "from-rose-500 to-rose-600",
    ring: "ring-rose-500",
    description:
      "Land the job, earn the promotion, hit the milestone. Celebrate and then reset for the next level.",
  },
];

// Positions for 6 nodes in a circle (angle starts at top, clockwise)
function circlePos(index: number, total: number, r: number, cx: number, cy: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

const CX = 200;
const CY = 200;
const R = 140;

export function LifecycleSection() {
  const [active, setActive] = useState<number | null>(null);

  const activeStage = STAGES.find((s) => s.id === active);

  return (
    <section id="lifecycle" className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <span className="mb-3 inline-block rounded-full bg-blue-50 px-4 py-1 text-sm font-medium text-blue-600">
            The System
          </span>
          <h2 className="text-4xl font-bold text-gray-900">Your Career Lifecycle</h2>
          <p className="mt-4 text-lg text-gray-500">
            Six stages. One continuous loop. Hover a stage to learn more.
          </p>
        </div>

        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-start lg:justify-center">
          {/* SVG Diagram */}
          <div className="relative w-full max-w-sm flex-shrink-0">
            <svg viewBox="0 0 400 400" className="w-full">
              {/* Connecting arcs (background ring) */}
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
                strokeDasharray="8 6"
              />

              {/* Connecting lines between adjacent nodes */}
              {STAGES.map((_, i) => {
                const from = circlePos(i, STAGES.length, R, CX, CY);
                const to = circlePos((i + 1) % STAGES.length, STAGES.length, R, CX, CY);
                const isActiveEdge =
                  active !== null &&
                  (STAGES[i].id === active || STAGES[(i + 1) % STAGES.length].id === active);
                return (
                  <line
                    key={i}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isActiveEdge ? "#3b82f6" : "#d1d5db"}
                    strokeWidth={isActiveEdge ? 2 : 1}
                    strokeOpacity={0.6}
                  />
                );
              })}

              {/* Center loop indicator */}
              <text x={CX} y={CY - 10} textAnchor="middle" className="fill-gray-400 text-xs" fontSize="11" fill="#9ca3af">
                ↻ repeat
              </text>
              <text x={CX} y={CY + 6} textAnchor="middle" fontSize="10" fill="#d1d5db">
                each cycle
              </text>

              {/* Stage nodes */}
              {STAGES.map((stage, i) => {
                const pos = circlePos(i, STAGES.length, R, CX, CY);
                const isActive = active === stage.id;
                return (
                  <g
                    key={stage.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setActive(stage.id)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(stage.id)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${stage.label}: ${stage.description}`}
                  >
                    {/* Outer glow ring when active */}
                    {isActive && (
                      <circle r="30" fill="none" stroke="#3b82f6" strokeWidth="2" strokeOpacity="0.4" />
                    )}
                    {/* Node circle */}
                    <circle
                      r="24"
                      fill={isActive ? "#1d4ed8" : "#f9fafb"}
                      stroke={isActive ? "#1d4ed8" : "#e5e7eb"}
                      strokeWidth="2"
                      className="transition-all duration-200"
                    />
                    {/* Icon */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="16"
                      className="pointer-events-none select-none"
                    >
                      {stage.icon}
                    </text>
                    {/* Label below */}
                    <text
                      y="36"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={isActive ? "700" : "500"}
                      fill={isActive ? "#1d4ed8" : "#6b7280"}
                      className="pointer-events-none select-none transition-colors duration-200"
                    >
                      {stage.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Description panel */}
          <div className="flex w-full max-w-sm flex-col justify-center">
            {activeStage ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-8 transition-all">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-3xl">{activeStage.icon}</span>
                  <h3 className="text-2xl font-bold text-gray-900">{activeStage.label}</h3>
                </div>
                <p className="leading-relaxed text-gray-600">{activeStage.description}</p>
                <a
                  href="/auth/signup"
                  className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Start this stage →
                </a>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <div className="mb-3 text-4xl">👆</div>
                <p className="text-gray-400">Hover a stage to see what iCareerOS does there</p>
                <div className="mt-6 space-y-2">
                  {STAGES.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{s.icon}</span>
                      <span className="font-medium text-gray-700">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
