import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

/**
 * Sprint 4 W3-F — CSV export of audit data.
 *
 * Mirrors the page's filter contract so a user can "Apply" filters on the page
 * and then click "Export CSV" to get exactly the rows they're seeing — plus a
 * generous trailing buffer (we cap at 5,000 rows server-side regardless of
 * the page's limit param).
 *
 * Permission:  audit.view   (admin + super_admin)
 * Audit:       logAdminAction("audit.export", {tab, q, severity, since, count})
 */

export const dynamic     = "force-dynamic";
export const fetchCache  = "force-no-store";
export const runtime     = "nodejs";

const EXPORT_CAP = 5000;

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function sinceToISO(since: string): string | null {
  const now = Date.now();
  switch (since) {
    case "1h":  return new Date(now - 60 * 60 * 1000).toISOString();
    case "24h": return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case "7d":  return new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all":
    default:    return null;
  }
}

// Minimal RFC-4180 cell quoting — wrap in quotes if cell contains comma,
// quote, or newline; double-up embedded quotes.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export async function GET(req: NextRequest) {
  const r = await requirePermission("audit.view");
  if (!r.ok) return permissionErrorResponse(r);

  const url      = new URL(req.url);
  const tab      = url.searchParams.get("tab") === "infra" ? "infra" : "admin";
  const q        = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const severity = url.searchParams.get("severity");
  const sevF     = severity && severity !== "all" ? severity : null;
  const since    = url.searchParams.get("since") ?? "7d";
  const sinceISO = sinceToISO(since);

  const svc = makeSvc();

  const lines: string[] = [];
  let count = 0;

  if (tab === "admin") {
    let qb = svc.from("admin_audit_log")
      .select("id, admin_email, admin_role, action, target_table, target_id, before_value, after_value, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(EXPORT_CAP);
    if (sinceISO) qb = qb.gte("created_at", sinceISO);
    const { data, error } = await qb;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    let rows = data ?? [];
    if (q) {
      rows = rows.filter(row =>
        (row.action ?? "").toLowerCase().includes(q) ||
        (row.admin_email ?? "").toLowerCase().includes(q) ||
        (row.target_table ?? "").toLowerCase().includes(q) ||
        (row.target_id ?? "").toLowerCase().includes(q),
      );
    }
    count = rows.length;
    lines.push(csvRow([
      "created_at", "admin_email", "admin_role", "action",
      "target_table", "target_id", "before_value", "after_value",
      "ip_address", "user_agent",
    ]));
    for (const row of rows) {
      lines.push(csvRow([
        row.created_at,
        row.admin_email,
        row.admin_role,
        row.action,
        row.target_table,
        row.target_id,
        row.before_value,
        row.after_value,
        row.ip_address,
        row.user_agent,
      ]));
    }
  } else {
    let qb = svc.from("infrastructure_events")
      .select("id, source, event_type, severity, payload, resolved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(EXPORT_CAP);
    if (sinceISO) qb = qb.gte("created_at", sinceISO);
    if (sevF)     qb = qb.eq("severity", sevF);
    const { data, error } = await qb;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    let rows = data ?? [];
    if (q) {
      rows = rows.filter(row =>
        (row.event_type ?? "").toLowerCase().includes(q) ||
        (row.source ?? "").toLowerCase().includes(q),
      );
    }
    count = rows.length;
    lines.push(csvRow([
      "created_at", "source", "event_type", "severity",
      "payload", "resolved_at",
    ]));
    for (const row of rows) {
      lines.push(csvRow([
        row.created_at,
        row.source,
        row.event_type,
        row.severity,
        row.payload,
        row.resolved_at,
      ]));
    }
  }

  // Audit the export itself
  await logAdminAction({
    ctx:          r.ctx,
    action:       "audit.export",
    target_table: tab === "admin" ? "admin_audit_log" : "infrastructure_events",
    after_value:  { tab, q, severity: sevF ?? "all", since, count },
  });

  const body  = lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fname = `audit-${tab}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control":       "no-store",
    },
  });
}
