/**
 * Sprint 5 P2-fix — Server-side helper to persist a stage's AI output
 * into career_os_stages.notes.
 *
 * Why this exists
 * ───────────────
 * Each of the 5 Career-OS agent routes (/api/career-os/{evaluate,advise,
 * learn,act,achieve}) used to ONLY return the AI result — they never wrote
 * to career_os_stages.notes. Persistence was historically a side-effect of
 * the orchestrator's stageRouter (called by advanceStage on the
 * dashboard). With Sprint 5 Phase 1 the new stage pages call the API
 * routes directly, so persistence has to happen here instead.
 *
 * Contract
 * ────────
 * - Upserts on (user_id, cycle_id, stage). Row is created if missing.
 * - status → "completed"
 * - started_at filled on insert; preserved on update
 * - ended_at refreshed on every write so re-runs show their latest time
 * - notes is the raw AI result object — same shape stageRouter's
 *   saveStageNotes uses (NOT namespaced under a sub-key).
 *
 * Never throws. Returns a tagged result so the API route can decide whether
 * the persistence failure is worth surfacing to the caller (typically no —
 * the AI result already returned successfully).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGE_ORDER } from "@/components/dashboard/stageStatus";

export type CareerOsStageKey = "evaluate" | "advise" | "learn" | "act" | "achieve" | "coach";

export type PersistResult =
  | { ok: true }
  | { ok: false; error: string };

export async function persistStageNotes(
  sb:       SupabaseClient,
  userId:   string,
  cycleId:  string,
  stage:    CareerOsStageKey,
  notes:    Record<string, unknown>,
): Promise<PersistResult> {
  const now = new Date().toISOString();

  // Look up existing row first so we know whether to update (preserve
  // started_at, just touch ended_at + status + notes) or insert.
  const { data: existing, error: lookupErr } = await sb
    .from("career_os_stages")
    .select("id")
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .eq("stage", stage)
    .maybeSingle();

  if (lookupErr) return { ok: false, error: lookupErr.message };

  if (existing) {
    const { error } = await sb
      .from("career_os_stages")
      .update({
        notes,
        status:   "completed",
        ended_at: now,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    await advanceCycleStageIfReady(sb, userId, cycleId, stage);
    return { ok: true };
  }

  const { error } = await sb
    .from("career_os_stages")
    .insert({
      user_id:    userId,
      cycle_id:   cycleId,
      stage,
      notes,
      status:     "completed",
      started_at: now,
      ended_at:   now,
    });
  if (error) return { ok: false, error: error.message };
  await advanceCycleStageIfReady(sb, userId, cycleId, stage);
  return { ok: true };
}

/**
 * 2026-06-30 (fix/jobs-stage-ux) — Auto-advance career_os_cycles.current_stage
 * to the next stage in STAGE_ORDER when a stage completes, IF the cycle's
 * current_stage pointer matches the stage that just completed.
 *
 * Why this is needed
 * ──────────────────
 * The orchestrator's `advanceStage()` function (only used by the dashboard's
 * "Run" deep-link) already advances current_stage. But every stage page
 * calls its API route directly, bypassing the orchestrator — so completion
 * via the stage pages never advanced the pointer. That left some users
 * with cycle.current_stage='evaluate' even though evaluate + advise were
 * both `status='completed'` in career_os_stages.
 *
 * Behaviour
 * ─────────
 * - Only advances forward. Never moves backward or skips.
 * - Only advances when the just-completed stage equals current_stage,
 *   so re-running an earlier stage doesn't reset progress.
 * - Stays on "achieve" when achieve completes (cycle completion is a
 *   separate event handled by completeCycle in the orchestrator).
 * - Best-effort: any error is swallowed so the persist call still
 *   returns ok:true (the AI result and the stage row are already saved).
 * - "coach" is not in STAGE_ORDER (5-stage model) — completing it is a
 *   no-op for current_stage.
 */
async function advanceCycleStageIfReady(
  sb:      SupabaseClient,
  userId:  string,
  cycleId: string,
  stage:   CareerOsStageKey,
): Promise<void> {
  try {
    // Use type-narrowing via Array.includes
    const stageOrderList = STAGE_ORDER as readonly string[];
    if (!stageOrderList.includes(stage)) return;

    const { data: cycle } = await sb
      .from("career_os_cycles")
      .select("current_stage")
      .eq("id", cycleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!cycle) return;

    // Only advance forward — if current_stage is already past us, do nothing.
    if (cycle.current_stage !== stage) return;

    const idx = stageOrderList.indexOf(stage);
    const next = idx >= 0 && idx < stageOrderList.length - 1
      ? stageOrderList[idx + 1]
      : null;
    if (!next) return; // achieve completed — leave pointer on achieve

    await sb
      .from("career_os_cycles")
      .update({ current_stage: next })
      .eq("id", cycleId)
      .eq("user_id", userId);
  } catch {
    // Best-effort — log nothing, swallow everything. The stage row write
    // already succeeded; auto-advance is a UX nicety, not a contract.
  }
}
