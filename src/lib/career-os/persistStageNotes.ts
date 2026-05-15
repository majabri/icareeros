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
    return error ? { ok: false, error: error.message } : { ok: true };
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
  return error ? { ok: false, error: error.message } : { ok: true };
}
