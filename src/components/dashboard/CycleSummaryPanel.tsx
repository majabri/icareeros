"use client";

import type { AchieveResult } from "@/services/ai/achieveService";
import type { EvaluationResult } from "@/services/ai/evaluateService";
import { pickNextCycleFocus } from "./cycleSummaryUtils";

interface CycleSummaryPanelProps {
  cycleNumber: number;
  goal: string | null;
  achieveNotes: AchieveResult | null;
  evaluateNotes: EvaluationResult | null;
  onStartNextCycle: (prefilledGoal?: string) => void;
  running: boolean;
}

export function CycleSummaryPanel({
  cycleNumber,
  goal,
  achieveNotes,
  evaluateNotes,
  onStartNextCycle,
  running,
}: CycleSummaryPanelProps) {
  const topNextFocus = pickNextCycleFocus(achieveNotes?.nextCycleRecommendations);

  return (
    <div
      data-testid="cycle-summary-panel"
      className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 p-6 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="text-4xl" aria-hidden="true">🏆</span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900">
            Cycle #{cycleNumber} complete!
          </h3>
          {goal && (
            <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">
              Goal: <span className="italic">{goal}</span>
            </p>
          )}
        </div>
      </div>

      {/* Celebration message */}
      {achieveNotes?.celebrationMessage && (
        <div className="mt-4 rounded-xl bg-white/70 border border-rose-100 px-4 py-3">
          <p className="text-sm text-rose-800 leading-relaxed">
            {achieveNotes.celebrationMessage}
          </p>
        </div>
      )}

      {/* Stats row */}
      {evaluateNotes?.marketFitScore != null && (
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-white/70 border border-gray-200
                          px-3 py-1.5 text-xs font-semibold text-gray-700">
            <span className="text-sky-600">🔍</span>
            <span>Market fit: {evaluateNotes.marketFitScore}/100</span>
          </div>
        </div>
      )}

      {/* Accomplishments */}
      {achieveNotes?.accomplishments && achieveNotes.accomplishments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            What you achieved
          </p>
          <div className="space-y-1.5">
            {achieveNotes.accomplishments.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-rose-500 text-sm">✓</span>
                <p className="text-sm text-gray-700 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next cycle recommendation */}
      {topNextFocus && (
        <div className="mt-4 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
          <p className="text-xs font-semibold text-brand-600 mb-1">Recommended next focus</p>
          <p className="text-sm text-brand-800 leading-relaxed">{topNextFocus}</p>
        </div>
      )}

      {/* CTA */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => onStartNextCycle(topNextFocus)}
          disabled={running}
          data-testid="start-next-cycle-btn"
          className="flex-1 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold
                     text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {running ? "Starting next cycle..." : "Start next cycle →"}
        </button>
        <button
          onClick={() => onStartNextCycle(undefined)}
          disabled={running}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm
                     text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Start with custom goal
        </button>
      </div>
    </div>
  );
}
