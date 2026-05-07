"use client";

/**
 * Career-snapshot sidebar for /coach. Shows current stage, completion ring
 * snapshot, and recommended actions pulled from the cached coach brief
 * (career_os_stages.notes.coach.brief — already populated by Phase 1).
 */

import type { ReactNode } from "react";

export interface CoachContextPanelProps {
  cycleNumber:    number | null;
  goal:           string | null;
  currentStage:   string | null;
  /** From career_os_stages.notes.coach.brief.content if cached, else null */
  cachedBrief?:   string | null;
  sessionsUsed?:  number;   // hidden when limit is unlimited (-1)
  sessionsLimit?: number;   // -1 = unlimited (badge hidden)
}

const STAGE_LABEL: Record<string, string> = {
  evaluate: "Evaluate", advise: "Advise", learn: "Learn",
  act:      "Act",      coach:  "Coach",  achieve: "Achieve",
};

export function CoachContextPanel(props: CoachContextPanelProps): ReactNode {
  const { cycleNumber, goal, currentStage, cachedBrief, sessionsUsed, sessionsLimit } = props;
  const showQuota = typeof sessionsLimit === "number" && sessionsLimit >= 0;
  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-900">Your career snapshot</h3>
        {cycleNumber !== null && (
          <p className="text-xs text-gray-500">
            Cycle #{cycleNumber}
            {goal ? ` — ${goal}` : ""}
          </p>
        )}
      </header>

      <section>
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Current stage</p>
        <p className="text-sm font-medium text-gray-800">{currentStage ? (STAGE_LABEL[currentStage] ?? currentStage) : "—"}</p>
      </section>

      {cachedBrief && (
        <section>
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Latest coaching brief</p>
          <p className="text-xs leading-relaxed text-gray-700 line-clamp-12 whitespace-pre-wrap">{cachedBrief}</p>
        </section>
      )}

      {showQuota && (
        <section className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600" data-testid="coach-quota-badge">
          <span className="font-semibold">{sessionsUsed ?? 0} / {sessionsLimit}</span> sessions used this month
        </section>
      )}
    </aside>
  );
}
