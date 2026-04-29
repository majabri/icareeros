/**
 * iCareerOS — Outreach Generator Service
 * Generates personalised LinkedIn and email outreach messages for a job opportunity.
 *
 * Calls: POST /api/outreach (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

export interface OutreachMessage {
  subject: string;
  message: string;
}

export interface OutreachResult {
  linkedin: OutreachMessage;
  email: OutreachMessage;
  tips: string[];
}

export async function generateOutreach(
  opportunityId: string,
  cycleId?: string,
): Promise<OutreachResult> {
  await eventLogger.logAiCall(
    "outreach-user",
    cycleId ?? "no-cycle",
    "generate-outreach",
    "started",
  );

  const res = await fetch("/api/outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      opportunity_id: opportunityId,
      cycle_id: cycleId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Outreach generation failed (${res.status})`);
  }

  const data = (await res.json()) as OutreachResult;

  await eventLogger.logAiCall(
    "outreach-user",
    cycleId ?? "no-cycle",
    "generate-outreach",
    "completed",
  );

  return data;
}
