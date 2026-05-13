/**
 * POST /api/cron/check-bugs-inbox
 *
 * ADR-005 Phase 2 (Sprint 2 W2-A) — bug-inbox triage cron.
 *
 * Runs every 30 min via Vercel cron. For every UNSEEN email in the
 * `bugs@icareeros.com` IMAP mailbox:
 *   1. Classify P0 / P1 / P2 via Claude Haiku (~0.001 USD each)
 *   2. P0/P1 → create a GitHub issue with the appropriate label
 *   3. P2   → log to infrastructure_events (severity=warning), no issue
 *   4. Mark the email as Seen so we don't reprocess
 *
 * Two-layer auth like every other cron:
 *   • Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically
 *   • Feature-flag kill-switch in the `feature_flags` table (key='bug_inbox_cron')
 *     lets the /admin/system control center disable the cron without code
 *     changes.
 *
 * Env vars required:
 *   BUGS_EMAIL_HOST     – IMAP host (e.g. mail.icareeros.com)
 *   BUGS_EMAIL_PORT     – 993 (IMAP-SSL) or 143
 *   BUGS_EMAIL_USER     – bugs@icareeros.com
 *   BUGS_EMAIL_PASSWORD – mailbox password
 *   ANTHROPIC_API_KEY   – already set (Haiku classification)
 *   GH_TOKEN            – already set (Issues: write scope on majabri/icareeros)
 */

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import Anthropic from "@anthropic-ai/sdk";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";
import { createClient } from "@supabase/supabase-js";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;            // IMAP + N Haiku calls; 60s plenty

type Severity = "P0" | "P1" | "P2";

interface ProcessedEmail {
  uid:        number;
  subject:    string;
  from:       string;
  severity:   Severity;
  github_url: string | null;
  error?:     string;
}

// ── Entry ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1) Vercel cron auth
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Kill-switch via feature_flags
  const killed = await isKillSwitchOn();
  if (killed) {
    return NextResponse.json({ ok: true, skipped: "kill_switch_on", processed: 0 });
  }

  // 3) Env-var check
  const host     = process.env.BUGS_EMAIL_HOST;
  const portStr  = process.env.BUGS_EMAIL_PORT;
  const user     = process.env.BUGS_EMAIL_USER;
  const password = process.env.BUGS_EMAIL_PASSWORD;
  if (!host || !portStr || !user || !password) {
    return NextResponse.json(
      { error: "missing_env", message: "Set BUGS_EMAIL_HOST/PORT/USER/PASSWORD" },
      { status: 500 },
    );
  }
  const port = parseInt(portStr, 10);

  const started = Date.now();

  // 4) Connect + process
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,                  // IMAP-SSL on 993, STARTTLS on 143
    auth: { user, pass: password },
    logger: false,                          // silent — we log our own events
  });

  const processed: ProcessedEmail[] = [];
  let connectionError: string | null = null;

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Fetch UIDs of unread messages
    const unseen = await client.search({ seen: false });

    // W1-B (Sprint 3 fix for B2): on empty INBOX, fall through to the
    // run_summary log at the end of POST rather than early-returning.
    // The for-loop below is a no-op when `unseen` is empty/falsy.
    // Fetch + classify + act on each
    for (const uid of (Array.isArray(unseen) ? unseen : [])) {
      try {
        const msg = await client.fetchOne(uid, {
          envelope:  true,
          source:    true,
          flags:     true,
        }, { uid: true });
        if (!msg) continue;

        const subject = msg.envelope?.subject ?? "(no subject)";
        const fromAddr = msg.envelope?.from?.[0];
        const from = fromAddr ? `${fromAddr.name ?? ""} <${fromAddr.address ?? ""}>`.trim() : "(unknown)";
        const body = await extractBody(msg);

        const severity = await classifyWithHaiku(subject, body);

        let issueUrl: string | null = null;
        if (severity === "P0" || severity === "P1") {
          issueUrl = await createGithubIssue(subject, body, severity, from);
          if (issueUrl) {
            // Successful GitHub issue creation.
            await logInfrastructureEvent({
              source:     "bug-inbox-cron",
              event_type: severity === "P0" ? "bug.p0_created" : "bug.p1_created",
              severity:   severity === "P0" ? "critical" : "error",
              payload: { uid, subject, from, github_url: issueUrl },
            });
          } else {
            // W1-A (Sprint 3 fix for B9): createGithubIssue returned null —
            // the GitHub API call failed (missing token / 401 / 5xx). Surface
            // this explicitly rather than logging the misleading 'created' event.
            await logInfrastructureEvent({
              source:     "bug-inbox-cron",
              event_type: "bug.github_create_failed",
              severity:   "error",
              payload: { uid, subject, from, classified_as: severity },
            });
          }
        } else {
          await logInfrastructureEvent({
            source:     "bug-inbox-cron",
            event_type: "bug.p2_seen",
            severity:   "warning",
            payload: { uid, subject, from, body_preview: body.slice(0, 240) },
          });
        }

        // Mark as Seen so we don't re-fetch
        await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });

        processed.push({ uid: uid as number, subject, from, severity, github_url: issueUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        processed.push({ uid: uid as number, subject: "", from: "", severity: "P2", github_url: null, error: msg });
        console.warn(`[bug-inbox-cron] msg uid=${uid} failed:`, msg);
      }
    }

    await client.logout();
  } catch (e) {
    connectionError = e instanceof Error ? e.message : "unknown_imap_failure";
    console.error("[bug-inbox-cron] IMAP error:", connectionError);
    await logInfrastructureEvent({
      source:     "bug-inbox-cron",
      event_type: "imap.connection_failed",
      severity:   "error",
      payload: { error: connectionError, host, port },
    });
  } finally {
    try { await client.logout(); } catch { /* idempotent */ }
  }

  // W1-B (Sprint 3 fix for B2): run_summary log so every cron tick is observable,
  // including empty-inbox runs and runs where GitHub creation failed.
  const p0Count = processed.filter(p => p.severity === "P0" && !p.error).length;
  const p1Count = processed.filter(p => p.severity === "P1" && !p.error).length;
  const p2Count = processed.filter(p => p.severity === "P2" && !p.error).length;
  const ghCreated = processed.filter(p => (p.severity === "P0" || p.severity === "P1") && p.github_url).length;
  const errorCount = processed.filter(p => p.error).length;
  await logInfrastructureEvent({
    source:     "bug-inbox-cron",
    event_type: "bug_inbox.run_summary",
    severity:   "info",
    payload: {
      emails_processed:       processed.length,
      p0_count:               p0Count,
      p1_count:               p1Count,
      p2_count:               p2Count,
      github_issues_created:  ghCreated,
      errors:                 errorCount,
      imap_connection_error:  connectionError ?? null,
      elapsed_ms:             Date.now() - started,
    },
  });

  return NextResponse.json({
    ok:        connectionError == null,
    error:     connectionError,
    processed: processed.length,
    detail:    processed,
    elapsed_ms: Date.now() - started,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function isKillSwitchOn(): Promise<boolean> {
  // Kill switch lives in feature_flags(key='bug_inbox_cron'). Default: ON
  // (cron runs). Toggling it OFF in /admin/system pauses processing without
  // a redeploy.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb
      .from("feature_flags")
      .select("enabled")
      .eq("key", "bug_inbox_cron")
      .maybeSingle();
    // ROW EXISTS + enabled=false → kill-switch is ON (we should skip)
    return data?.enabled === false;
  } catch {
    return false;
  }
}

async function extractBody(msg: FetchMessageObject): Promise<string> {
  // Source is the raw MIME — extract the text/plain body. Simple parse to
  // avoid pulling in a full MIME library; for richer parsing later, swap
  // for `mailparser`.
  const raw = msg.source?.toString("utf-8") ?? "";
  // Find the first blank line — separates headers from body
  const sepIdx = raw.search(/\r?\n\r?\n/);
  if (sepIdx === -1) return raw.slice(0, 8000);
  const body = raw.slice(sepIdx + 2);
  // Naively strip MIME boundary noise + HTML tags, cap length
  return body
    .replace(/--[A-Za-z0-9=._-]+(?:--)?/g, "")
    .replace(/Content-Type:[^\n]+/gi, "")
    .replace(/Content-Transfer-Encoding:[^\n]+/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function classifyWithHaiku(subject: string, body: string): Promise<Severity> {
  // Fallback to P2 if no API key or call fails — fail-safe (no spurious P0s).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "P2";
  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 8,
      messages: [{
        role: "user",
        content:
          "Classify this bug report as P0 (production down), P1 (major feature broken), " +
          "or P2 (minor issue). Reply with only: P0, P1, or P2.\n\n" +
          `Subject: ${subject}\n\nBody:\n${body.slice(0, 3500)}`,
      }],
    });
    const block = res.content[0];
    if (block?.type !== "text") return "P2";
    const text = block.text.trim().toUpperCase();
    if (text.startsWith("P0")) return "P0";
    if (text.startsWith("P1")) return "P1";
    return "P2";
  } catch (e) {
    console.warn("[bug-inbox-cron] Haiku classify failed:", (e as Error).message);
    return "P2";
  }
}

async function createGithubIssue(
  subject: string,
  body:    string,
  severity: "P0" | "P1",
  fromHeader: string,
): Promise<string | null> {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    console.warn("[bug-inbox-cron] GH_TOKEN missing — cannot auto-create issue");
    return null;
  }
  const label = severity.toLowerCase();          // 'p0' / 'p1'
  const issueBody =
    `${body}\n\n---\n_Auto-created from bugs@icareeros.com_\n` +
    `_Reporter (email From): ${fromHeader}_\n` +
    `_Severity (Haiku-classified): **${severity}**_`;
  try {
    const res = await fetch("https://api.github.com/repos/majabri/icareeros/issues", {
      method: "POST",
      headers: {
        "Authorization":          `token ${ghToken}`,
        "Accept":                  "application/vnd.github+json",
        "X-GitHub-Api-Version":    "2022-11-28",
        "Content-Type":            "application/json",
      },
      body: JSON.stringify({
        title:  `[${severity}] ${subject}`,
        body:   issueBody,
        labels: ["bug", label],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[bug-inbox-cron] GH issue create failed ${res.status}: ${t.slice(0, 200)}`);
      return null;
    }
    const j = await res.json();
    return j.html_url ?? null;
  } catch (e) {
    console.warn("[bug-inbox-cron] GH issue create error:", (e as Error).message);
    return null;
  }
}

// Vercel cron sends GET by default; mirror health-check route pattern.
export async function GET(req: NextRequest) { return POST(req); }
