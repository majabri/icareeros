/**
 * iCareerOS — Act Service (Stage 4 of Career OS)
 * Triggers real-world actions: job search, applications, networking.
 *
 * Calls: run-job-agent edge fn
 * Full implementation: Week 3
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "@/orchestrator/eventLogger";

export type ActionType =
  | "search_opportunities"
  | "queue_applications"
  | "send_outreach"
  | "schedule_followups";

export interface ActResult {
  action: ActionType;
  opportunitiesFound: number;
  applicationsQueued: number;
  agentRunId: string;
  summary: string;
}

export async function triggerAction(
  userId: string,
  cycleId: string,
  action: ActionType,
): Promise<ActResult> {
  const supabase = createClient();

  await eventLogger.logAiCall(userId, cycleId, "run-job-agent", "started", {
    action,
  });

  const { data, error } = await supabase.functions.invoke("run-job-agent", {
    body: {
      user_id: userId,
      cycle_id: cycleId,
      action,
    },
  });

  if (error) {
    await eventLogger.logAiCall(userId, cycleId, "run-job-agent", "failed", {
      action,
      error: error.message,
    });
    throw new Error(`triggerAction failed: ${error.message}`);
  }

  const result: ActResult = {
    action,
    opportunitiesFound: data?.jobs_found ?? 0,
    applicationsQueued: data?.applications_queued ?? 0,
    agentRunId: data?.agent_run_id ?? "",
    summary: data?.summary ?? "",
  };

  await eventLogger.logAiCall(userId, cycleId, "run-job-agent", "completed", {
    action,
    opportunitiesFound: result.opportunitiesFound,
    applicationsQueued: result.applicationsQueued,
  });

  return result;
}
