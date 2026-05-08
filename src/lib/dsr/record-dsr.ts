/**
 * Server-side DSR (Data Subject Rights) audit-trail recorder.
 * Per COWORK-BRIEF-legal-deploy-v1 Phase 6 (reconciled): layered on top of
 * existing immediate-action endpoints to provide a regulatory audit record
 * alongside the user-facing immediate response.
 *
 * Schema reminder (from migration 20260507_legal_compliance_phase0):
 *   id              bigserial pk
 *   user_id         uuid references auth.users on delete set null
 *   email           text not null
 *   request_type    text not null
 *   status          text not null default 'received'
 *   jurisdiction    text
 *   notes           text
 *   received_at     timestamptz default now()
 *   due_by          timestamptz
 *   completed_at    timestamptz
 *
 * NEVER throws. Failures log to console only — DSR audit must never block
 * the user-facing immediate action.
 */

import { createClient } from "@supabase/supabase-js";

export type DSRRequestType =
  | "access"            // Right to know / data export
  | "deletion"          // Right to be forgotten / account deletion
  | "correction"        // Right to rectification (future)
  | "withdraw_consent"; // Withdraw a previously-given consent (future)

export type DSRStatus = "received" | "in_progress" | "completed" | "rejected";

export interface DSRRequestInput {
  userId: string;
  email: string;
  requestType: DSRRequestType;
  status?: DSRStatus;
  jurisdiction?: string;
  notes?: string;
  /** Defaults: 30 days for deletion, 45 days for everything else. */
  dueByDays?: number;
  /** When status is 'completed' on insert, set completed_at to now(). */
  completedNow?: boolean;
}

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function recordDSRRequest(input: DSRRequestInput): Promise<void> {
  try {
    const days = input.dueByDays ?? (input.requestType === "deletion" ? 30 : 45);
    const dueBy = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const svc = makeServiceClient();
    const { error } = await svc.from("dsr_requests").insert({
      user_id: input.userId,
      email: input.email,
      request_type: input.requestType,
      status: input.status ?? "received",
      jurisdiction: input.jurisdiction ?? null,
      notes: input.notes ?? null,
      due_by: dueBy,
      completed_at: input.completedNow ? new Date().toISOString() : null,
    });
    if (error) console.error("[dsr] Failed to record:", error.message);
  } catch (err) {
    console.error("[dsr] Unexpected error:", err);
  }
}
