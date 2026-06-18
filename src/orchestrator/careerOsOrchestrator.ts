/**
 * iCareerOS — Career OS Orchestrator
 * Controls the lifecycle of a career cycle: Evaluate → Advise → Learn → Act → Coach → Achieve
 *
 * Each user progresses through one cycle at a time. When a cycle completes
 * it loops back to Evaluate at the next level.
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "./eventLogger";
import { stageRouter } from "./stageRouter";
import type { Tables } from "@/types/database";

export type CareerOsStage =
  | "evaluate"
  | "advise"
  | "learn"
  | "act"
  | "coach"
  | "achieve";

export type CycleStatus = "active" | "completed" | "abandoned";

export interface CycleResult {
  cycleId: string;
  cycleNumber: number;
  status: CycleStatus;
  error?: string;
}

export interface StageResult {
  cycleId: string;
  stage: CareerOsStage;
  status: "in_progress" | "completed" | "skipped";
  error?: string;
}

/**
 * Maximum concurrent active cycles a user may have. Soft cap enforced in
 * startCycle (returns { status: "abandoned" } with an explanatory error
 * when exceeded). The dashboard UI uses the same constant to disable the
 * "+ New Cycle" button.
 */
export const MAX_ACTIVE_CYCLES = 3;

const STAGE_ORDER: CareerOsStage[] = [
  "evaluate",
  "advise",
  "learn",
  "act",
  "coach",
  "achieve",
];

/** Start a new career OS cycle for the given user */
export async function startCycle(
  userId: string,
  goal?: string,
): Promise<CycleResult> {
  const supabase = createClient();

  // 2026-06-18 — Cap at MAX_ACTIVE_CYCLES concurrent active cycles per user.
  // Prevents runaway-cycle-creation that has no DB-level backstop today
  // (no unique index, no CHECK constraint, no trigger — RLS only enforces
  // ownership). UI mirrors this by disabling the "+ New Cycle" button.
  const { count } = await supabase
    .from("career_os_cycles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if ((count ?? 0) >= MAX_ACTIVE_CYCLES) {
    return {
      cycleId:     "",
      cycleNumber: 0,
      status:      "abandoned",
      error:       `You can have up to ${MAX_ACTIVE_CYCLES} active cycles at a time. Complete or delete one before starting a new one.`,
    };
  }

  // Find the highest existing cycle number for this user
  const { data: existing } = await supabase
    .from("career_os_cycles")
    .select("cycle_number")
    .eq("user_id", userId)
    .order("cycle_number", { ascending: false })
    .limit(1);

  const cycleNumber = existing && existing.length > 0
    ? existing[0].cycle_number + 1
    : 1;

  const { data: cycle, error } = await supabase
    .from("career_os_cycles")
    .insert({
      user_id: userId,
      cycle_number: cycleNumber,
      goal: goal ?? null,
      status: "active",
      current_stage: "evaluate",
    })
    .select()
    .single();

  if (error || !cycle) {
    return { cycleId: "", cycleNumber, status: "abandoned", error: error?.message };
  }

  // Seed all 6 stages as 'pending'
  const stageRows = STAGE_ORDER.map((stage) => ({
    cycle_id: cycle.id,
    user_id: userId,
    stage,
    status: "pending" as const,
  }));

  // Bug 7 fix (2026-06-18): capture stages-insert error. The cycle row was
  // already committed, so abandoning at this point would leave an orphan.
  // Log and continue — stage rows are recoverable on the next dashboard
  // load (the UI tolerates missing rows + buildStageStatus falls back to
  // 'pending' for any stage without notes).
  const { error: stagesErr } = await supabase
    .from("career_os_stages")
    .insert(stageRows);
  if (stagesErr) {
    console.warn(
      `[startCycle] career_os_stages seed failed for cycle ${cycle.id}: ${stagesErr.message}. Cycle row is intact; stages can be re-seeded.`,
    );
  }

  await eventLogger.log(userId, cycle.id, "cycle_started", {
    cycleNumber,
    goal,
  });

  return { cycleId: cycle.id, cycleNumber, status: "active" };
}

/** Advance the current stage of a cycle to in_progress, then route it */
export async function advanceStage(
  userId: string,
  cycleId: string,
  stage: CareerOsStage,
): Promise<StageResult> {
  const supabase = createClient();

  // Mark stage as in_progress
  const { error: updateError } = await supabase
    .from("career_os_stages")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("cycle_id", cycleId)
    .eq("stage", stage);

  if (updateError) {
    return { cycleId, stage, status: "skipped", error: updateError.message };
  }

  await eventLogger.log(userId, cycleId, "stage_started", { stage });

  // Delegate to stage router
  const routeResult = await stageRouter.route(userId, cycleId, stage);

  // Mark stage completed (or skipped on error)
  const finalStatus = routeResult.success ? "completed" : "skipped";
  await supabase
    .from("career_os_stages")
    .update({ status: finalStatus, ended_at: new Date().toISOString() })
    .eq("cycle_id", cycleId)
    .eq("stage", stage);

  // Advance current_stage in the cycle to the next stage
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const nextStage = stageIdx < STAGE_ORDER.length - 1
    ? STAGE_ORDER[stageIdx + 1]
    : stage; // stays on achieve if already last
  await supabase
    .from("career_os_cycles")
    .update({ current_stage: nextStage })
    .eq("id", cycleId)
    .eq("user_id", userId);

  await eventLogger.log(userId, cycleId, "stage_ended", {
    stage,
    status: finalStatus,
    nextStage,
    ...routeResult.meta,
  });

  return { cycleId, stage, status: finalStatus };
}

/** Mark a cycle as completed and log achievement */
export async function completeCycle(
  userId: string,
  cycleId: string,
): Promise<CycleResult> {
  const supabase = createClient();

  const { data: cycle, error } = await supabase
    .from("career_os_cycles")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", cycleId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !cycle) {
    return { cycleId, cycleNumber: 0, status: "abandoned", error: error?.message };
  }

  await eventLogger.log(userId, cycleId, "cycle_completed", {
    cycleNumber: cycle.cycle_number,
  });

  return { cycleId, cycleNumber: cycle.cycle_number, status: "completed" };
}

/** Abandon a cycle (user chose to restart or pivot) */
export async function abandonCycle(
  userId: string,
  cycleId: string,
  reason?: string,
): Promise<void> {
  const supabase = createClient();

  await supabase
    .from("career_os_cycles")
    .update({ status: "abandoned" })
    .eq("id", cycleId)
    .eq("user_id", userId);

  await eventLogger.log(userId, cycleId, "cycle_abandoned", { reason });
}

/** Get the active cycle for a user, or null if none */
export async function getActiveCycle(
  userId: string,
): Promise<{ id: string; cycle_number: number; goal: string | null; status: string; current_stage: string } | null> {
  const supabase = createClient();
  // Bug 7 fix (2026-06-18): use .maybeSingle() for the canonical "0 or 1
  // row" shape. `.single()` returns a PGRST116 error code on the empty case
  // — harmless here because we coerce `data ?? null`, but the spurious
  // error noisily logs in Supabase and confuses callers. `.maybeSingle()`
  // is the documented Supabase pattern for this shape.
  const { data } = await supabase
    .from("career_os_cycles")
    .select("id, cycle_number, goal, status, current_stage")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/**
 * List ALL active cycles for a user. The user can have multiple parallel
 * cycles (one per goal on their roadmap) — getActiveCycle returns just the
 * most recent, but the dashboard uses this to show a switcher when more
 * than one cycle is active.
 */
export async function listActiveCycles(
  userId: string,
): Promise<Array<{ id: string; cycle_number: number; goal: string | null; status: string; current_stage: string; created_at: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_os_cycles")
    .select("id, cycle_number, goal, status, current_stage, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

/**
 * Hard delete a cycle (and via FK ON DELETE CASCADE: its career_os_stages
 * rows). Verifies ownership before deleting — throws if the cycle doesn't
 * exist or belongs to a different user. RLS provides defence in depth; the
 * explicit ownership check produces a clean 404 / 403 surface for the API
 * layer.
 *
 * Use this for cycles the user wants permanently removed. For soft archival
 * semantics use abandonCycle (status -> "abandoned") instead.
 */
export async function deleteCycle(
  userId: string,
  cycleId: string,
): Promise<void> {
  const supabase = createClient();

  const { data: cycle } = await supabase
    .from("career_os_cycles")
    .select("id, user_id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!cycle) {
    throw new Error("Cycle not found or not owned by user");
  }

  const { error } = await supabase
    .from("career_os_cycles")
    .delete()
    .eq("id", cycleId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * List all COMPLETED cycles for a user (status='completed'). Same row
 * shape as listActiveCycles. Used by the dashboard + CycleSwitcher to
 * render the read-only "Completed cycles" history section.
 */
export async function listCompletedCycles(
  userId: string,
): Promise<Array<{ id: string; cycle_number: number; goal: string | null; status: string; current_stage: string; created_at: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_os_cycles")
    .select("id, cycle_number, goal, status, current_stage, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

