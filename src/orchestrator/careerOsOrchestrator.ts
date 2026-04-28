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

  await supabase.from("career_os_stages").insert(stageRows);

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

  await eventLogger.log(userId, cycleId, "stage_ended", {
    stage,
    status: finalStatus,
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
  const { data } = await supabase
    .from("career_os_cycles")
    .select("id, cycle_number, goal, status, current_stage")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}
