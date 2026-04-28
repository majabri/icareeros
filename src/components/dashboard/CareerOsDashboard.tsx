"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient }    from "@/lib/supabase";
import { CycleStageCard }  from "./CycleStageCard";
import {
  startCycle,
  getActiveCycle,
  advanceStage,
  completeCycle,
  type CareerOsStage,

} from "@/orchestrator/careerOsOrchestrator";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { getSubscription } from "@/services/billing/subscriptionService";
import type { SubscriptionPlan } from "@/services/billing/types";

interface ActiveCycle {
  id: string;
  cycle_number: number;
  goal: string | null;
  status: string;
  current_stage: string;
}


const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "coach", "achieve",
];

type StageStatusMap = Record<CareerOsStage, "pending" | "in_progress" | "completed" | "skipped">;

function buildStageStatus(
  cycle: ActiveCycle | null
): StageStatusMap {
  const current = cycle?.current_stage as CareerOsStage | undefined;
  const status: StageStatusMap = {
    evaluate: "pending", advise: "pending", learn: "pending",
    act: "pending",      coach: "pending",  achieve: "pending",
  };

  if (!current) return status;

  const currentIdx = STAGE_ORDER.indexOf(current);
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const s = STAGE_ORDER[i];
    if (i < currentIdx)      status[s] = "completed";
    else if (i === currentIdx) status[s] = cycle?.status === "active" ? "in_progress" : "completed";
  }
  return status;
}

export function CareerOsDashboard() {
  const [userId, setUserId]       = useState<string | null>(null);
  const [cycle, setCycle]         = useState<ActiveCycle | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatusMap>(buildStageStatus(null));
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [plan, setPlan]           = useState<SubscriptionPlan>("free");
  const [error, setError]         = useState<string | null>(null);
  const [goal, setGoal]           = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Load user + active cycle
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }

      const [activeCycle, sub] = await Promise.all([
        getActiveCycle(uid),
        getSubscription(),
      ]);

      setCycle(activeCycle);
      setStageStatus(buildStageStatus(activeCycle));
      setPlan(sub?.plan ?? "free");
      setLoading(false);
    });
  }, []);

  const handleStartCycle = useCallback(async () => {
    if (!userId) return;
    setRunning(true);
    setError(null);
    try {
      const result = await startCycle(userId, goal || undefined);
      if (result.status === "abandoned") {
        setError(result.error ?? "Failed to start cycle.");
      } else {
        const fresh = await getActiveCycle(userId);
        setCycle(fresh);
        setStageStatus(buildStageStatus(fresh));
        setShowGoalInput(false);
        setGoal("");
      }
    } finally {
      setRunning(false);
    }
  }, [userId, goal]);

  const handleAdvanceStage = useCallback(async () => {
    if (!userId || !cycle) return;
    const currentStage = cycle.current_stage as CareerOsStage;
    setRunning(true);
    setError(null);
    try {
      const result = await advanceStage(userId, cycle.id, currentStage);
      if (result.error) {
        setError(result.error ?? `Failed to run ${currentStage}.`);
      } else {
        const fresh = await getActiveCycle(userId);
        setCycle(fresh);
        setStageStatus(buildStageStatus(fresh));
      }
    } finally {
      setRunning(false);
    }
  }, [userId, cycle]);

  const handleCompleteCycle = useCallback(async () => {
    if (!userId || !cycle) return;
    setRunning(true);
    try {
      await completeCycle(userId, cycle.id);
      setCycle(null);
      setStageStatus(buildStageStatus(null));
    } finally {
      setRunning(false);
    }
  }, [userId, cycle]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  const currentStage = cycle?.current_stage as CareerOsStage | undefined;
  const cycleComplete =
    currentStage === "achieve" && stageStatus.achieve === "completed";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Career OS</h2>
          <p className="mt-1 text-sm text-gray-500">
            Your AI-powered career operating system — Evaluate → Advise → Learn → Act → Coach → Achieve
          </p>
        </div>
        <PlanBadge plan={plan} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* No active cycle */}
      {!cycle && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <div className="text-4xl">🎯</div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Start your career cycle</h3>
          <p className="mt-2 text-sm text-gray-500">
            Define a goal, then let AI guide you through each stage.
          </p>

          {showGoalInput ? (
            <div className="mt-6 space-y-3">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Land a Senior Product Manager role at a Series B startup"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                           focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleStartCycle()}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleStartCycle}
                  disabled={running}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                             text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {running ? "Starting…" : "Start cycle"}
                </button>
                <button
                  onClick={() => setShowGoalInput(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowGoalInput(true)}
              className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-6 py-2.5
                         text-sm font-semibold text-white hover:bg-blue-700"
            >
              + New cycle
            </button>
          )}
        </div>
      )}

      {/* Active cycle */}
      {cycle && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-700">Cycle #{cycle.cycle_number}</span>
                {cycle.goal && (
                  <span className="ml-2 text-gray-500">— {cycle.goal}</span>
                )}
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                Active
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${Math.round(
                      ((STAGE_ORDER.indexOf(currentStage ?? "evaluate") + 1) /
                        STAGE_ORDER.length) *
                        100
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Stage {STAGE_ORDER.indexOf(currentStage ?? "evaluate") + 1} of {STAGE_ORDER.length}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAGE_ORDER.map((stage) => (
              <CycleStageCard
                key={stage}
                stage={stage}
                status={stageStatus[stage]}
                isCurrentStage={stage === currentStage && !cycleComplete}
                onRun={
                  stage === currentStage && !cycleComplete
                    ? handleAdvanceStage
                    : undefined
                }
                running={running}
              />
            ))}
          </div>

          {cycleComplete && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
              <div className="text-3xl">🎉</div>
              <h3 className="mt-2 font-semibold text-green-800">Cycle complete!</h3>
              <p className="mt-1 text-sm text-green-600">
                You&apos;ve completed all 6 stages. Ready to level up again?
              </p>
              <button
                onClick={handleCompleteCycle}
                disabled={running}
                className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold
                           text-white hover:bg-green-700 disabled:opacity-50"
              >
                {running ? "Completing…" : "Complete & start next cycle"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
