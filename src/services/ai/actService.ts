/**
 * iCareerOS — Act Service (Stage 4 of Career OS)
 * Generates a concrete job-search and networking action plan.
 *
 * Calls: POST /api/career-os/act (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

export type ActionType =
  | "search_opportunities"
  | "queue_applications"
  | "send_outreach"
  | "schedule_followups";

export interface NetworkingTarget {
  role: string;
  company: string;
  rationale: string;
  outreachTip: string;
}

export interface ApplicationTier {
  roleTier: "Stretch" | "Target" | "Safety";
  description: string;
  targetCount: number;
  rationale: string;
}

export interface ActResult {
  jobSearchQueries: string[];
  networkingTargets: NetworkingTarget[];
  applicationPriority: ApplicationTier[];
  weeklyApplicationTarget: number;
  summary: string;
  // Legacy fields kept for stageRouter.meta compatibility
  action?: ActionType;
  opportunitiesFound?: number;
  applicationsQueued?: number;
  agentRunId?: string;
}

export async function triggerAction(
  userId: string,
  cycleId: string,
): Promise<ActResult> {
  await eventLogger.logAiCall(userId, cycleId, "generate-action-plan", "started");

  const res = await fetch("/api/career-os/act", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycle_id: cycleId }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "generate-action-plan", "failed", {
      error: err.error,
      status: res.status,
    });
    throw new Error("triggerAction failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as ActResult;

  await eventLogger.logAiCall(userId, cycleId, "generate-action-plan", "completed", {
    queryCount: result.jobSearchQueries.length,
    networkingTargetCount: result.networkingTargets.length,
    weeklyApplicationTarget: result.weeklyApplicationTarget,
  });

  return result;
}
