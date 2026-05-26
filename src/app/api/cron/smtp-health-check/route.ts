/**
 * GET/POST /api/cron/smtp-health-check
 *
 * Vercel Cron — daily at 04:00 UTC per `vercel.json`.
 *
 * Sends a self-ping through the same Bluehost SMTP relay that Supabase
 * Auth uses for confirmation + recovery emails. Logs the result to
 * `infrastructure_events` so BetterStack can alert on
 * `severity='critical'`.
 *
 * Why this exists — 2026-05-24 production lockout: Bluehost SMTP failed
 * silently for ~26 hours before anyone noticed (Amir got locked out
 * personally and reported it). This cron provides the leading
 * indicator. See [[incident_2026-05-24_auth_lockout_smtp]] and
 * [[incident_2026-05-24_auth_lockout_root_cause]].
 *
 * Filed as T-017 in `docs/backlog.md`. ADR-005 Phase 2.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ts          = new Date().toISOString();
  const probeTarget = process.env.BLUEHOST_SMTP_USER ?? "bugs@icareeros.com";
  const start       = Date.now();

  try {
    const result = await sendMail({
      to:      probeTarget,
      subject: `[SMTP-HEALTH] Probe ${ts}`,
      html:    `<p>iCareerOS SMTP health probe at ${ts}. Self-ping &mdash; safe to ignore.</p>`,
      text:    `iCareerOS SMTP health probe at ${ts}. Self-ping — safe to ignore.`,
    });
    const elapsed = Date.now() - start;

    if (result === null) {
      // SMTP not configured (local dev / preview without env). Log as warning, not failure.
      await logInfrastructureEvent({
        source:     "smtp-cron",
        event_type: "smtp.skipped",
        severity:   "warning",
        payload:    { reason: "SMTP env not configured", elapsed_ms: elapsed, ts },
      });
      return NextResponse.json({ ok: true, skipped: true, elapsed_ms: elapsed, ts });
    }

    await logInfrastructureEvent({
      source:     "smtp-cron",
      event_type: "smtp.ok",
      severity:   "info",
      payload:    {
        elapsed_ms: elapsed,
        message_id: result.messageId ?? null,
        accepted:   result.accepted ?? [],
        rejected:   result.rejected ?? [],
        ts,
      },
    });

    return NextResponse.json({
      ok:         true,
      elapsed_ms: elapsed,
      message_id: result.messageId ?? null,
      ts,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;

    await logInfrastructureEvent({
      source:     "smtp-cron",
      event_type: "smtp.send_failed",
      severity:   "critical",
      payload:    {
        error:       errorMessage,
        error_code:  errorCode,
        ts,
        elapsed_ms:  elapsed,
        suspected:   "Bluehost SMTP auth drift OR outbound quota OR TLS — see docs/email-bluehost-rotation-runbook.md",
      },
    });

    return NextResponse.json(
      { ok: false, error: errorMessage, ts, elapsed_ms: elapsed },
      { status: 500 },
    );
  }
}

// GET delegates to POST so manual curl probes work (matches the existing
// health-check pattern + the PR #210 GET/POST convention).
export async function GET(req: NextRequest) { return POST(req); }
