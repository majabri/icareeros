/**
 * iCareerOS — Cover Letter Generator Service
 * Generates a tailored cover letter for a job opportunity.
 *
 * Calls: POST /api/cover-letter (server-side Next.js route -> Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

export interface CoverLetterResult {
  /** Email subject line for when submitting via email */
  subject: string;
  /** Full cover letter body with newlines */
  body: string;
  /** Approximate word count */
  word_count: number;
  /** 3 specific personalisation tips */
  tips: string[];
}

export async function generateCoverLetter(
  opportunityId: string,
  cycleId?: string,
): Promise<CoverLetterResult> {
  await eventLogger.logAiCall(
    "cover-letter-user",
    cycleId ?? "no-cycle",
    "generate-cover-letter",
    "started",
  );

  const res = await fetch("/api/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      opportunity_id: opportunityId,
      cycle_id: cycleId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Cover letter generation failed (${res.status})`);
  }

  const data = (await res.json()) as CoverLetterResult;

  await eventLogger.logAiCall(
    "cover-letter-user",
    cycleId ?? "no-cycle",
    "generate-cover-letter",
    "completed",
  );

  return data;
}
