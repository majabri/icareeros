/**
 * Sprint 4 W1-D — Admin action audit logger
 *
 * Every admin-side mutation must call logAdminAction() with a clear `action`
 * string. Reads go through `requirePermission("audit.view")`. Writes are
 * via the service-role client because the table is locked down to service
 * role only (see migration sprint4_w1_admin_roles_and_audit_log).
 *
 * Conventions for `action`:
 *   <domain>.<verb>      e.g. "users.plan_changed", "flags.toggled",
 *                            "users.role_assigned", "support.ticket_closed",
 *                            "opportunities.ingest_triggered"
 *
 * before_value / after_value should be the relevant slice of the row, not
 * the entire row (PII minimization). For toggles, a simple
 * { enabled: false } / { enabled: true } pair is sufficient.
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { readRequestContext, type AdminContext } from "./permissions";

export interface LogAdminActionParams {
  /** Admin who performed the action — from requirePermission's ctx. */
  ctx: AdminContext;
  /** Stable identifier for the action. See conventions above. */
  action: string;
  /** Optional: which table the action targeted. */
  target_table?: string;
  /** Optional: which row the action targeted. */
  target_id?: string;
  /** Optional: state before the change. JSON-serializable. */
  before_value?: unknown;
  /** Optional: state after the change. JSON-serializable. */
  after_value?: unknown;
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  const { ctx, action, target_table, target_id, before_value, after_value } = params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Should never happen in production but don't crash an admin action over a logging failure.
    console.warn("[admin-audit] Supabase env missing — skipping audit log insert");
    return;
  }

  const reqCtx = await readRequestContext();

  const sb = createServiceClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.from("admin_audit_log").insert({
    admin_user_id: ctx.user_id,
    admin_email:   ctx.email,
    admin_role:    ctx.admin_role,
    action,
    target_table:  target_table ?? null,
    target_id:     target_id ?? null,
    before_value:  before_value ?? null,
    after_value:   after_value ?? null,
    ip_address:    reqCtx.ip_address,
    user_agent:    reqCtx.user_agent,
  });

  if (error) {
    // Logging-side failure is non-blocking — log to console + Sentry will pick it up.
    console.warn("[admin-audit] insert failed:", error.message, { action, target_table });
  }
}
