"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { useAutorunStage } from "@/components/stage/useAutorunStage";
import { recordAchievement, type AchieveResult } from "@/services/ai/achieveService";
import { completeCycle } from "@/orchestrator/careerOsOrchestrator";

const PRIORITY_BADGE: Record<"high" | "medium" | "low", string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low:    "bg-gray-100 text-gray-700",
};

export function AchievePageInner() {
  const router = useRouter();
  const { loading, userId, cycle, output, reload, setOutput } = useStageData<AchieveResult>("achieve");
  const [running, setRunning]       = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      const result = await recordAchievement(userId, cycle.id);
      setOutput(result);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Achieve failed. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  async function handleCompleteCycle() {
    if (!userId || !cycle) return;
    setCompleting(true); setError(null);
    try {
      await completeCycle(userId, cycle.id);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the cycle.");
      setCompleting(false);
    }
  }

    // Sprint 5 UX (2026-05-16) — Fire handleRun() automatically
  // when the user lands here via the dashboard's "Run" deep-link
  // (`?autorun=1`). Guards against re-runs when output already exists.
  useAutorunStage({
    ready:     !loading && !!cycle && !!userId,
    hasOutput: !!output,
    running,
    onRun:     handleRun,
  });

  return (
    <StagePageScaffold
      title="Achieve"
      subtitle="Milestone + next cycle"
      stageLabel="Achieve"
      outputNoun="Achievement"
      loading={loading}
      noCycle={!loading && !cycle}
      hasOutput={!!output}
      error={error}
      running={running}
      cycleInfo={cycle ? { cycleNumber: cycle.cycle_number, goal: cycle.goal } : null}
      cycleId={cycle?.id ?? null}
      userId={userId}
      onRun={handleRun}
    >
      {output && (
        <div className="space-y-6">
          {/* Hero celebration banner */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
            <div className="text-4xl">🎉</div>
            <div className="mt-2 inline-flex items-center rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900">
              {output.milestoneType.replace(/_/g, " ")}
            </div>
            <p className="mt-3 text-base text-amber-900 max-w-xl mx-auto">{output.celebrationMessage}</p>
            <p className="mt-3 text-xs text-amber-700">Achieved {new Date(output.achievedAt).toLocaleDateString()}</p>
          </div>

          {output.summary && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 border-l-4 border-l-brand-500">
              <p className="text-sm leading-relaxed text-gray-700">{output.summary}</p>
            </div>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Accomplishments</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              {output.accomplishments.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">✓</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </section>

          {output.nextCycleRecommendations.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Next cycle focus</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {output.nextCycleRecommendations.map((r, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_BADGE[r.priority]}`}>
                      {r.priority}
                    </span>
                    <p className="mt-2 text-sm text-gray-800">{r.focus}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {output.cycleReadyToComplete && (
            <section className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6 text-center">
              <h3 className="text-lg font-semibold text-brand-900">This cycle is ready to wrap up</h3>
              <p className="mt-1 text-sm text-brand-700 max-w-md mx-auto">
                Mark this cycle complete and start fresh with a new goal on the dashboard.
              </p>
              <button
                onClick={() => void handleCompleteCycle()}
                disabled={completing}
                className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {completing ? "Completing…" : "Complete this cycle →"}
              </button>
              <div className="mt-2">
                <Link href="/dashboard" className="text-xs text-brand-700 underline">Back to dashboard</Link>
              </div>
            </section>
          )}
        </div>
      )}
    </StagePageScaffold>
  );
}
