"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveCycle } from "@/orchestrator/careerOsOrchestrator";
import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

/**
 * Sprint 5 Phase 1 — Shared loader for stage pages.
 *
 * Pulls user_id, active cycle, and the persisted output blob from
 * career_os_stages.notes for a given stage. Returns a loading flag so
 * pages can render a skeleton until ready.
 *
 * The output's shape varies by stage — each page narrows it with its own
 * generic parameter (e.g. EvaluationResult, AdviceResult, etc.).
 */
export interface StageDataState<T> {
  loading: boolean;
  userId:  string | null;
  cycle:   { id: string; cycle_number: number; goal: string | null; current_stage: string } | null;
  output:  T | null;
  /** Force a refetch — useful after running the stage to refresh notes. */
  reload:  () => Promise<void>;
}

export function useStageData<T>(stage: CareerOsStage): StageDataState<T> {
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [cycle,   setCycle]   = useState<StageDataState<T>["cycle"]>(null);
  const [output,  setOutput]  = useState<T | null>(null);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    setUserId(uid);

    if (!uid) { setLoading(false); return; }

    const activeCycle = await getActiveCycle(uid);
    if (!activeCycle) { setCycle(null); setOutput(null); setLoading(false); return; }
    setCycle(activeCycle as StageDataState<T>["cycle"]);

    const { data: stageRow } = await supabase
      .from("career_os_stages")
      .select("notes")
      .eq("user_id", uid)
      .eq("cycle_id", activeCycle.id)
      .eq("stage", stage)
      .maybeSingle();

    // notes can hold many shapes (coach.brief, evaluate output, etc.).
    // Each stage stores its own keyed blob — we look for the stage key first,
    // then fall back to the whole notes object for older rows that stored the
    // result un-namespaced.
    const raw = (stageRow?.notes ?? null) as Record<string, unknown> | null;
    const candidate =
      (raw && typeof raw === "object" && stage in raw)
        ? (raw[stage] as T)
        : (raw as T | null);
    setOutput(candidate ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return { loading, userId, cycle, output, reload: load };
}
