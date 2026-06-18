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
  /**
   * Sprint 5 fix — immediate setter so the page can display the API
   * response directly without waiting for a DB round-trip. This bypasses
   * any race with the orchestrator's advanceStage (which is fire-and-
   * forget from /mycareer/profile when the user saves their profile and
   * can clobber the stage row while my reload() is in flight).
   */
  setOutput: (next: T | null) => void;
}

/**
 * Sprint 5 hotfix (2026-05-15) — `career_os_stages.notes` defaults to
 * `'{}'::jsonb`, so every freshly-seeded stage row arrives with notes set
 * to an EMPTY OBJECT, not null. Without this guard the hook would return
 * `output = {}` for any stage the user hasn't run yet, hasOutput would be
 * truthy, and the OutputPanel would crash on the first unguarded property
 * access (e.g. `result.skills.length` → TypeError on undefined).
 *
 * Required fields per stage — narrow guard before we treat the candidate
 * as a valid stored output. Anything missing → return null and show the
 * empty state instead.
 */
/**
 * Sprint 5 hotfix (2026-05-16) — Each entry is `[key, expectedType]` so
 * we can validate the persisted notes actually have the SHAPE the
 * downstream OutputPanel expects, not just the right keys. Previously
 * `isValidStageOutput` only checked key presence — a notes blob with
 * `skills: null` passed the gate and crashed EvaluateOutputPanel at
 * `result.skills.length`.
 */
const STAGE_REQUIRED_FIELDS: Record<CareerOsStage, readonly [string, "array" | "string"][]> = {
  evaluate: [["skills", "array"], ["gaps", "array"], ["summary", "string"]],
  advise:   [["recommendedPaths", "array"], ["nextActions", "array"], ["summary", "string"]],
  learn:    [["resources", "array"], ["topSkillGaps", "array"], ["summary", "string"]],
  act:      [["jobSearchQueries", "array"], ["applicationPriority", "array"], ["summary", "string"]],
  achieve:  [["accomplishments", "array"], ["celebrationMessage", "string"], ["milestoneType", "string"]],
} as const;

function isValidStageOutput(stage: CareerOsStage, candidate: unknown): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  const obj = candidate as Record<string, unknown>;
  const required = STAGE_REQUIRED_FIELDS[stage];
  if (required.length === 0) return Object.keys(obj).length > 0;   // coach: just non-empty
  return required.every(([key, kind]) => {
    if (!(key in obj)) return false;
    const v = obj[key];
    if (kind === "array")  return Array.isArray(v);
    if (kind === "string") return typeof v === "string";
    return false;
  });
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
        ? (raw[stage] as unknown)
        : (raw as unknown);

    // Sprint 5 hotfix — empty `{}` (DB default) or shape-mismatched object
    // would crash the OutputPanel. Validate before exposing as output.
    setOutput(isValidStageOutput(stage, candidate) ? (candidate as T) : null);
    setLoading(false);
  }

  useEffect(() => {
    void load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return { loading, userId, cycle, output, reload: load, setOutput };
}
