// support-action-runner — Phase 2 v1.1
//
// v1.1 fix: getVaultSecret now uses public.get_resolver_secret() rpc rather
// than reading vault.decrypted_secrets directly. PostgREST only exposes the
// `public` schema, so the prior implementation always returned null even with
// the service role key.
//
// NOTE (W3-C backport, 2026-05-09): the EXPECTED_SECRET below is currently
// hardcoded to match the value in vault.secrets at deploy time. Future work
// should pull this from Deno.env at runtime so the file can be safely public.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const EXPECTED_SECRET = "e14f918e-5ee6-4be2-84db-33a797b597f2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CONFIDENCE_FLOOR = 0.85;
const PER_USER_WINDOW_MIN = 10;
const PER_USER_LIMIT = 1;
const GLOBAL_WINDOW_SEC = 60;
const GLOBAL_LIMIT = 10;

type DevopsTier = "L0" | "L1" | "L2" | "L3";

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  priority: string;
  classification: string | null;
  classifier_confidence: number | null;
  devops_tier: DevopsTier | null;
  action_taken: string | null;
  status: string;
}

interface ActionResult {
  outcome: "verified" | "failed" | "skipped";
  action_taken: string;
  next_status: string;
  notes: string;
  user_facing: boolean;
  error?: string;
}

function svc() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function getVaultSecret(name: string): Promise<string | null> {
  const supabase = svc();
  // public.get_resolver_secret(secret_name text) is a SECURITY DEFINER wrapper
  // around vault.decrypted_secrets. Granted to service_role only.
  const { data, error } = await supabase.rpc("get_resolver_secret", { secret_name: name });
  if (error) {
    console.error("getVaultSecret rpc failed", error);
    return null;
  }
  if (!data) return null;
  // rpc returns the scalar text directly
  return typeof data === "string" ? data : null;
}

async function logAttempt(opts: {
  source_id: string;
  status: "started" | "action_taken" | "no_action" | "error";
  action: string;
  classification?: string | null;
  classifier_conf?: number | null;
  error?: string;
  notes?: Record<string, unknown>;
}): Promise<string | null> {
  const supabase = svc();
  const { data, error } = await supabase.from("recovery_attempts").insert({
    source: "support_ticket",
    source_id: opts.source_id,
    classification: opts.classification ?? null,
    classifier_conf: opts.classifier_conf ?? null,
    action: opts.action,
    status: opts.status,
    error: opts.error ?? null,
    notes: opts.notes ?? {},
    finished_at: opts.status === "started" ? null : new Date().toISOString(),
  }).select("id").single();
  if (error) console.error("logAttempt failed", error);
  return data?.id ?? null;
}

async function checkRateLimits(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = svc();
  const userWindow = new Date(Date.now() - PER_USER_WINDOW_MIN * 60_000).toISOString();
  const { data: userTickets } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("user_id", userId);
  const userTicketIds = (userTickets ?? []).map(t => t.id);

  if (userTicketIds.length > 0) {
    const { count: userCount } = await supabase
      .from("recovery_attempts")
      .select("*", { count: "exact", head: true })
      .eq("status", "action_taken")
      .gte("finished_at", userWindow)
      .in("source_id", userTicketIds);
    if ((userCount ?? 0) >= PER_USER_LIMIT) {
      return { ok: false, reason: `per-user rate limit: ${userCount} actions in last ${PER_USER_WINDOW_MIN} min (limit ${PER_USER_LIMIT})` };
    }
  }

  const globalWindow = new Date(Date.now() - GLOBAL_WINDOW_SEC * 1000).toISOString();
  const { count: globalCount } = await supabase
    .from("recovery_attempts")
    .select("*", { count: "exact", head: true })
    .eq("status", "action_taken")
    .gte("finished_at", globalWindow);
  if ((globalCount ?? 0) >= GLOBAL_LIMIT) {
    return { ok: false, reason: `global rate limit: ${globalCount} actions in last ${GLOBAL_WINDOW_SEC}s (limit ${GLOBAL_LIMIT})` };
  }

  return { ok: true };
}

// ── Action: create GitHub issue ────────────────────────────────────────────

async function createGitHubIssue(ticket: Ticket, userEmail: string): Promise<ActionResult> {
  const pat = await getVaultSecret("github_pat");
  if (!pat || pat === "PLACEHOLDER_NOT_SET") {
    return {
      outcome: "failed",
      action_taken: "create_github_issue",
      next_status: "open",
      notes: `[${new Date().toISOString()}] L0 action skipped: github_pat vault secret not set. To enable: SELECT vault.update_secret(...).`,
      user_facing: false,
      error: "github_pat not set in vault",
    };
  }

  const repo = "majabri/icareeros";
  const issueBody = [
    `**Source:** support ticket \`${ticket.id}\``,
    `**Reporter:** ${userEmail}`,
    `**Priority:** ${ticket.priority}`,
    `**Classifier:** ${ticket.classification} / ${ticket.devops_tier} / ${(ticket.classifier_confidence ?? 0).toFixed(2)}`,
    "",
    "---",
    "",
    "## Description",
    "",
    ticket.body,
    "",
    "---",
    "",
    "_Auto-created by `support-action-runner` from a classified L0 support ticket. Triage and assign as normal._",
  ].join("\n");

  let resp: Response;
  try {
    resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "icareeros-support-action-runner/1.0",
      },
      body: JSON.stringify({
        title: `[Auto] ${ticket.subject}`,
        body: issueBody,
        labels: ["auto-from-support", `tier:${ticket.devops_tier}`, `class:${ticket.classification}`],
      }),
    });
  } catch (e) {
    return {
      outcome: "failed",
      action_taken: "create_github_issue",
      next_status: "open",
      notes: `[${new Date().toISOString()}] L0 action failed: github fetch threw ${(e as Error).message}`,
      user_facing: false,
      error: (e as Error).message,
    };
  }

  if (resp.status !== 201) {
    const errText = (await resp.text()).slice(0, 500);
    return {
      outcome: "failed",
      action_taken: "create_github_issue",
      next_status: "open",
      notes: `[${new Date().toISOString()}] L0 action failed: GitHub returned ${resp.status}: ${errText}`,
      user_facing: false,
      error: `github ${resp.status}: ${errText}`,
    };
  }

  const issue = await resp.json();
  const issueUrl: string = issue.html_url;
  const issueNumber: number = issue.number;

  return {
    outcome: "verified",
    action_taken: "create_github_issue",
    next_status: "in_progress",
    notes: `[${new Date().toISOString()}] L0 auto-action: created GitHub issue #${issueNumber} → ${issueUrl}`,
    user_facing: false,
  };
}

async function triggerPasswordReset(ticket: Ticket, userEmail: string): Promise<ActionResult> {
  const supabase = svc();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: userEmail,
    options: { redirectTo: "https://icareeros.com/auth/update-password" },
  });
  if (error) {
    return {
      outcome: "failed",
      action_taken: "trigger_password_reset",
      next_status: "open",
      notes: `[${new Date().toISOString()}] L1 action failed: auth admin returned ${error.message}`,
      user_facing: false,
      error: error.message,
    };
  }
  const actionLink = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;
  if (!actionLink) {
    return {
      outcome: "failed",
      action_taken: "trigger_password_reset",
      next_status: "open",
      notes: `[${new Date().toISOString()}] L1 action failed: auth admin returned no action_link`,
      user_facing: false,
      error: "no action_link in response",
    };
  }
  return {
    outcome: "verified",
    action_taken: "trigger_password_reset",
    next_status: "resolved",
    notes: `[${new Date().toISOString()}] L1 auto-action: triggered password reset email to ${userEmail}. User should receive it within 1–2 minutes.`,
    user_facing: true,
  };
}

function routeToHuman(reason: string): ActionResult {
  return {
    outcome: "skipped",
    action_taken: "route_to_human",
    next_status: "open",
    notes: `[${new Date().toISOString()}] No auto-action for this combination. Reason: ${reason}. Human review required.`,
    user_facing: false,
  };
}

async function pickAndRunAction(ticket: Ticket, userEmail: string): Promise<ActionResult> {
  const supabase = svc();
  if (ticket.devops_tier === "L0") {
    return await createGitHubIssue(ticket, userEmail);
  }
  if (ticket.devops_tier === "L1") {
    const { data: rule } = await supabase
      .from("recovery_rules")
      .select("action, is_active")
      .eq("trigger_event", "support_ticket_classified")
      .filter("config->>tier", "eq", "L1")
      .filter("config->>classification", "eq", ticket.classification ?? "")
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!rule || !rule.is_active) {
      return routeToHuman(`no active L1 rule for classification=${ticket.classification}`);
    }
    switch (rule.action) {
      case "trigger_password_reset":
        return await triggerPasswordReset(ticket, userEmail);
      case "route_to_human":
        return routeToHuman(`recovery_rules dispatched route_to_human for L1+${ticket.classification}`);
      case "cache_flush_user":
      case "resend_user_email":
        return routeToHuman(`action ${rule.action} not yet implemented in v1`);
      default:
        return routeToHuman(`unknown action ${rule.action}`);
    }
  }
  return routeToHuman(`tier ${ticket.devops_tier} is human-only`);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-resolver-secret") !== EXPECTED_SECRET) {
    return jsonResp({ error: "unauthorized" }, 401);
  }
  let payload: { ticket_id?: string };
  try { payload = await req.json(); } catch {
    return jsonResp({ error: "invalid json" }, 400);
  }
  const ticket_id = payload.ticket_id;
  if (!ticket_id || typeof ticket_id !== "string") {
    return jsonResp({ error: "missing ticket_id" }, 400);
  }

  await logAttempt({ source_id: ticket_id, status: "started", action: "dispatch" });

  const supabase = svc();

  const { data: ticket, error: loadErr } = await supabase
    .from("support_tickets")
    .select("id, user_id, subject, body, priority, classification, classifier_confidence, devops_tier, action_taken, status")
    .eq("id", ticket_id)
    .single();

  if (loadErr || !ticket) {
    await logAttempt({ source_id: ticket_id, status: "error", action: "dispatch", error: loadErr?.message ?? "ticket not found" });
    return jsonResp({ error: "ticket not found" }, 404);
  }
  const t = ticket as unknown as Ticket;

  if (t.action_taken) {
    await logAttempt({ source_id: ticket_id, status: "no_action", action: "dispatch", notes: { reason: "action_already_taken", action_taken: t.action_taken } });
    return jsonResp({ skipped: "already actioned" }, 200);
  }

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "support_auto_action")
    .single();

  const flagEnabled = (flag as { enabled: boolean } | null)?.enabled === true;
  if (!flagEnabled) {
    await supabase.from("support_tickets").update({ action_outcome: "flag_off" }).eq("id", ticket_id);
    await logAttempt({
      source_id: ticket_id, status: "no_action", action: "flag_off",
      classification: t.classification, classifier_conf: t.classifier_confidence,
      notes: { reason: "feature_flag support_auto_action is OFF", devops_tier: t.devops_tier },
    });
    return jsonResp({ skipped: "feature flag off" }, 200);
  }

  if ((t.classifier_confidence ?? 0) < CONFIDENCE_FLOOR) {
    await supabase.from("support_tickets").update({ action_outcome: "skipped" }).eq("id", ticket_id);
    await logAttempt({
      source_id: ticket_id, status: "no_action", action: "low_confidence",
      classification: t.classification, classifier_conf: t.classifier_confidence,
      notes: { reason: `confidence ${t.classifier_confidence} < ${CONFIDENCE_FLOOR}` },
    });
    return jsonResp({ skipped: "low confidence" }, 200);
  }

  if (t.devops_tier !== "L0" && t.devops_tier !== "L1") {
    await supabase.from("support_tickets").update({ action_outcome: "skipped" }).eq("id", ticket_id);
    await logAttempt({
      source_id: ticket_id, status: "no_action", action: "tier_human_only",
      classification: t.classification, classifier_conf: t.classifier_confidence,
      notes: { reason: `tier ${t.devops_tier} is human-only` },
    });
    return jsonResp({ skipped: "tier is human-only" }, 200);
  }

  const rateCheck = await checkRateLimits(t.user_id);
  if (!rateCheck.ok) {
    await supabase.from("support_tickets").update({ action_outcome: "rate_limited" }).eq("id", ticket_id);
    await logAttempt({
      source_id: ticket_id, status: "no_action", action: "rate_limited",
      classification: t.classification, classifier_conf: t.classifier_confidence,
      notes: { reason: rateCheck.reason },
    });
    return jsonResp({ skipped: "rate limited", reason: rateCheck.reason }, 200);
  }

  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(t.user_id);
  if (authErr || !authUser?.user?.email) {
    await logAttempt({ source_id: ticket_id, status: "error", action: "dispatch", error: `could not resolve user email: ${authErr?.message ?? "no email"}` });
    return jsonResp({ error: "could not resolve user" }, 500);
  }
  const userEmail = authUser.user.email;

  const result = await pickAndRunAction(t, userEmail);

  const ticketUpdate: Record<string, unknown> = {
    action_taken: result.action_taken,
    action_outcome: result.outcome,
    status: result.next_status,
    auto_resolved: result.outcome === "verified" && result.next_status === "resolved",
  };
  const { data: current } = await supabase.from("support_tickets").select("admin_notes").eq("id", ticket_id).single();
  const existingNotes = (current as { admin_notes: string | null } | null)?.admin_notes ?? "";
  ticketUpdate.admin_notes = (existingNotes + "\n\n" + result.notes).trim();

  const { error: updErr } = await supabase.from("support_tickets").update(ticketUpdate).eq("id", ticket_id);
  if (updErr) {
    await logAttempt({
      source_id: ticket_id, status: "error", action: result.action_taken,
      classification: t.classification, classifier_conf: t.classifier_confidence,
      error: `ticket update failed: ${updErr.message}`,
    });
    return jsonResp({ error: updErr.message }, 500);
  }

  await logAttempt({
    source_id: ticket_id,
    status: result.outcome === "verified" ? "action_taken" : "no_action",
    action: result.action_taken,
    classification: t.classification, classifier_conf: t.classifier_confidence,
    error: result.error,
    notes: { outcome: result.outcome, user_facing: result.user_facing, next_status: result.next_status },
  });

  return jsonResp({
    success: true,
    action_taken: result.action_taken,
    outcome: result.outcome,
    next_status: result.next_status,
  }, 200);
});
