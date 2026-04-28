/**
 * iCareerOS — Event Logger
 * Writes Career OS lifecycle events to platform_events.
 * Every stage transition, cycle start/complete, and AI call is logged here.
 */

import { createClient } from "@/lib/supabase";

export type CareerOsEventType =
  | "cycle_started"
  | "cycle_completed"
  | "cycle_abandoned"
  | "stage_started"
  | "stage_ended"
  | "ai_call_started"
  | "ai_call_completed"
  | "ai_call_failed"
  | "goal_achieved"
  | "milestone_reached";

export interface EventPayload {
  userId: string;
  cycleId: string;
  eventType: CareerOsEventType;
  meta?: Record<string, unknown>;
  ts: string;
}

export const eventLogger = {
  async log(
    userId: string,
    cycleId: string,
    eventType: CareerOsEventType,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const supabase = createClient();
    const payload: EventPayload = {
      userId,
      cycleId,
      eventType,
      meta,
      ts: new Date().toISOString(),
    };

    // Write to platform_events if it exists; fail silently so it never
    // breaks the main orchestrator flow
    try {
      await supabase.functions.invoke("event-processor", {
        body: {
          type: `career_os.${eventType}`,
          user_id: userId,
          payload,
        },
      });
    } catch {
      // Non-blocking: log to console only
      console.warn(`[eventLogger] Failed to log event ${eventType}`, payload);
    }
  },

  /** Convenience: log an AI call lifecycle */
  async logAiCall(
    userId: string,
    cycleId: string,
    fnName: string,
    phase: "started" | "completed" | "failed",
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const eventType: CareerOsEventType =
      phase === "started"
        ? "ai_call_started"
        : phase === "completed"
          ? "ai_call_completed"
          : "ai_call_failed";

    await eventLogger.log(userId, cycleId, eventType, { fnName, ...meta });
  },
};
