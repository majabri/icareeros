/**
 * /admin/tickets — Support inbox with status management.
 * Uses service-role client to bypass RLS — sees ALL tickets regardless of owner.
 *
 * 2026-04-30: extended to surface support-resolver output
 *   (classification, devops_tier, classifier_confidence, suggested_response).
 *   See docs/Audit_Support_Autonomous_Loop_2026-04-30.md.
 */

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { priorityBadgeClass } from "@/services/supportService";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import { TicketStatusSelect } from "@/components/admin/TicketStatusSelect";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support Inbox — iCareerOS Admin" };

type Classification =
  | "ACCOUNT_ACCESS"
  | "STALE_DATA"
  | "EMAIL_DELIVERY"
  | "BILLING_DISPUTE"
  | "BUG_REPORT"
  | "FEATURE_REQUEST"
  | "OTHER";

type DevopsTier = "L0" | "L1" | "L2" | "L3";

interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  user_id: string;
  classification: Classification | null;
  classifier_confidence: number | null;
  devops_tier: DevopsTier | null;
  suggested_response: string | null;
  admin_notes: string | null;
}

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

function sectionLabel(status: TicketStatus): string {
  return { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" }[status];
}

function sectionStyle(status: TicketStatus): { header: string; border: string } {
  return {
    open:        { header: "text-blue-700",   border: "border-blue-100" },
    in_progress: { header: "text-yellow-700", border: "border-yellow-100" },
    resolved:    { header: "text-green-700",  border: "border-green-100" },
    closed:      { header: "text-gray-400",   border: "border-gray-100" },
  }[status];
}

// ── AI panel helpers ────────────────────────────────────────────────────────

function classificationStyle(c: Classification | null): string {
  if (!c) return "bg-gray-100 text-gray-500";
  return ({
    ACCOUNT_ACCESS:   "bg-purple-50 text-purple-700",
    STALE_DATA:       "bg-cyan-50 text-cyan-700",
    EMAIL_DELIVERY:   "bg-indigo-50 text-indigo-700",
    BILLING_DISPUTE:  "bg-orange-50 text-orange-700",
    BUG_REPORT:       "bg-red-50 text-red-700",
    FEATURE_REQUEST:  "bg-amber-50 text-amber-700",
    OTHER:            "bg-gray-50 text-gray-600",
  } satisfies Record<Classification, string>)[c];
}

function tierStyle(t: DevopsTier | null): { class: string; note: string } {
  if (!t) return { class: "bg-gray-100 text-gray-500", note: "" };
  return ({
    L0: { class: "bg-emerald-100 text-emerald-800", note: "single-bug debug — auto-action eligible" },
    L1: { class: "bg-emerald-100 text-emerald-800", note: "live-ops — auto-action eligible" },
    L2: { class: "bg-amber-100 text-amber-800",     note: "feature/build — human review" },
    L3: { class: "bg-rose-100 text-rose-800",       note: "architecture — human review" },
  } satisfies Record<DevopsTier, { class: string; note: string }>)[t];
}

function confidenceLabel(c: number | null): string {
  if (c == null) return "";
  if (c >= 0.85) return "high";
  if (c >= 0.6)  return "medium";
  return "low";
}

export default async function AdminTicketsPage() {
  const svc = makeSvc();

  const { data: tickets, error } = await svc
    .from("support_tickets")
    .select(
      "id, subject, body, priority, status, created_at, updated_at, user_id, " +
      "classification, classifier_confidence, devops_tier, suggested_response, admin_notes"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Support Inbox</h1>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
          <strong>Error loading tickets:</strong> {error.message}
        </div>
      </div>
    );
  }

  const all = (tickets ?? []) as unknown as AdminTicket[];

  const byStatus = STATUS_ORDER.reduce<Record<TicketStatus, AdminTicket[]>>((acc, s) => {
    acc[s] = all.filter(t => t.status === s);
    return acc;
  }, { open: [], in_progress: [], resolved: [], closed: [] });

  const unknown = all.filter(t => !STATUS_ORDER.includes(t.status as TicketStatus));

  const openCount = byStatus.open.length + byStatus.in_progress.length;
  const aiClassified = all.filter(t => t.classification != null).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          {openCount} active · {byStatus.resolved.length + byStatus.closed.length} closed · {all.length} total
          {aiClassified > 0 && <> · <span className="text-emerald-700">{aiClassified} AI-classified</span></>}
        </p>
      </div>

      {all.length === 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-10 text-center text-sm text-green-700">
          🎉 No tickets yet.
        </div>
      )}

      {(["open", "in_progress"] as TicketStatus[]).map(s => {
        const tickets = byStatus[s];
        if (tickets.length === 0) return null;
        const style = sectionStyle(s);
        return (
          <section key={s}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${style.header}`}>
              {sectionLabel(s)} ({tickets.length})
            </h2>
            <ul className="space-y-3">
              {tickets.map(ticket => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </ul>
          </section>
        );
      })}

      {(["resolved", "closed"] as TicketStatus[]).map(s => {
        const tickets = byStatus[s];
        if (tickets.length === 0) return null;
        const style = sectionStyle(s);
        return (
          <section key={s}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${style.header}`}>
              {sectionLabel(s)} ({tickets.length})
            </h2>
            <ul className="space-y-2">
              {tickets.map(ticket => (
                <TicketCard key={ticket.id} ticket={ticket} compact />
              ))}
            </ul>
          </section>
        );
      })}

      {unknown.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">
            Unknown Status ({unknown.length})
          </h2>
          <ul className="space-y-2">
            {unknown.map(ticket => (
              <li key={ticket.id} className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-mono text-amber-700">
                {ticket.subject} — status: &quot;{ticket.status}&quot;
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TicketCard({ ticket, compact = false }: { ticket: AdminTicket; compact?: boolean }) {
  const tier = tierStyle(ticket.devops_tier);
  const hasAi = ticket.classification != null;

  return (
    <li className={`rounded-xl border border-gray-200 bg-white shadow-sm ${compact ? "px-4 py-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/admin/tickets/${ticket.id}`}
            className={`font-semibold text-gray-900 hover:text-brand-600 hover:underline ${compact ? "text-sm" : "text-sm"} dark:text-gray-100 dark:hover:text-brand-400`}
          >
            {ticket.subject}
          </Link>
          {!compact && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-4 whitespace-pre-wrap">{ticket.body}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${priorityBadgeClass(ticket.priority)}`}>
              {ticket.priority}
            </span>
            <span>{new Date(ticket.created_at).toLocaleString()}</span>
            {!compact && <span className="font-mono truncate max-w-[200px]">uid: {ticket.user_id}</span>}
          </div>
        </div>

        <div className="flex-shrink-0 pt-0.5">
          <TicketStatusSelect ticketId={ticket.id} currentStatus={ticket.status as TicketStatus} />
        </div>
      </div>

      {/* AI Analysis panel — only renders when the resolver has classified this ticket */}
      {hasAi && !compact && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-gray-500">AI</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${classificationStyle(ticket.classification)}`}>
              {ticket.classification}
            </span>
            {ticket.devops_tier && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${tier.class}`}
                title={tier.note}
              >
                {ticket.devops_tier}
              </span>
            )}
            {ticket.classifier_confidence != null && (
              <span className="text-gray-500">
                {(ticket.classifier_confidence * 100).toFixed(0)}% ({confidenceLabel(ticket.classifier_confidence)})
              </span>
            )}
            {ticket.devops_tier && (
              <span className="text-gray-400 italic">{tier.note}</span>
            )}
          </div>

          {ticket.suggested_response && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer text-gray-700 hover:text-gray-900 select-none">
                Suggested response (review before sending)
              </summary>
              <p className="mt-1 whitespace-pre-wrap rounded bg-white border border-gray-100 px-3 py-2 leading-relaxed">
                {ticket.suggested_response}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Compact AI badge for resolved/closed view */}
      {hasAi && compact && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
          <span>AI:</span>
          <span className={`rounded px-1.5 py-px ${classificationStyle(ticket.classification)}`}>
            {ticket.classification}
          </span>
          {ticket.devops_tier && (
            <span className={`rounded px-1.5 py-px ${tier.class}`}>{ticket.devops_tier}</span>
          )}
        </div>
      )}
    </li>
  );
}
