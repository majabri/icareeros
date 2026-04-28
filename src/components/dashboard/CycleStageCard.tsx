"use client";

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

interface StageConfig {
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
}

const STAGE_CONFIG: Record<CareerOsStage, StageConfig> = {
  evaluate: {
    label: "Evaluate",
    description: "Assess your skills, gaps, and market fit",
    icon: "🔍",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
  },
  advise: {
    label: "Advise",
    description: "Get AI-powered career path recommendations",
    icon: "💡",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  learn: {
    label: "Learn",
    description: "Acquire the skills your target role demands",
    icon: "📚",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
  },
  act: {
    label: "Act",
    description: "Apply, network, and build real-world experience",
    icon: "🚀",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  coach: {
    label: "Coach",
    description: "Interview prep, resume polish, and accountability",
    icon: "🎯",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
  },
  achieve: {
    label: "Achieve",
    description: "Land the role, promotion, or milestone",
    icon: "🏆",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
  },
};

type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

interface CycleStageCardProps {
  stage: CareerOsStage;
  status: StageStatus;
  isCurrentStage: boolean;
  onRun?: () => void;
  running?: boolean;
}

export function CycleStageCard({
  stage,
  status,
  isCurrentStage,
  onRun,
  running = false,
}: CycleStageCardProps) {
  const config = STAGE_CONFIG[stage];

  const statusBadge: Record<StageStatus, { label: string; class: string }> = {
    pending:     { label: "Pending",     class: "bg-gray-100 text-gray-500" },
    in_progress: { label: "In Progress", class: "bg-blue-100 text-blue-700" },
    completed:   { label: "Done",        class: "bg-green-100 text-green-700" },
    skipped:     { label: "Skipped",     class: "bg-gray-100 text-gray-400" },
  };

  const badge = statusBadge[status];

  return (
    <div
      className={`
        relative rounded-xl border p-5 transition-shadow
        ${config.bg}
        ${isCurrentStage ? "shadow-md ring-2 ring-blue-400 ring-offset-2" : "shadow-sm"}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{config.icon}</span>
          <div>
            <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{config.description}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.class}`}>
          {badge.label}
        </span>
      </div>

      {isCurrentStage && onRun && (
        <button
          onClick={onRun}
          disabled={running}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold
                     text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {running ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Running {config.label}…
            </span>
          ) : (
            `Run ${config.label}`
          )}
        </button>
      )}

      {status === "completed" && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-green-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Stage complete
        </div>
      )}
    </div>
  );
}
