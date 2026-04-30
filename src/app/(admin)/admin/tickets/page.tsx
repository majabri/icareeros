/**
 * /admin/tickets — Support inbox with status management.
 * Uses service-role client to bypass RLS — sees ALL tickets regardless of owner.
 */

import { createClient } from "@supabase/supabase-js";
import { priorityBadgeClass } from "@/services/supportService";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import { TicketStatusSelect } from "@/components/admin/TicketStatusSelect";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support Inbox — iCareerOS Admin" };

interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  user_id: string;
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

export default async function AdminTicketsPage() {
  const svc = makeSvc();

  const { data: tickets, error } = await svc
    .from("support_tickets")
    .select("id, subject, body, priority, status, created_at, updated_at, user_id")
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

  const all = (tickets ?? []) as AdminTicket[];

  // Group by status
  const byStatus = STATUS_ORDER.reduce<Record<TicketStatus, AdminTicket[]>>((acc, s) => {
    acc[s] = all.filter(t => t.status === s);
    return acc;
  }, { open: [], in_progress: [], resolved: [], closed: [] });

  // Tickets with unexpected status values
  const unknown = all.filter(t => !STATUS_ORDER.includes(t.status as TicketStatus));

  const openCount = byStatus.open.length + byStatus.in_progress.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          {openCount} active · {byStatus.resolved.length + byStatus.closed.length} closed · {all.length} total
        </p>
      </div>

      {all.length === 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-10 text-center text-sm text-green-700">
          🎉 No tickets yet.
        </div>
      )}

      {/* Active statuses first */}
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

      {/* Resolved / Closed — collapsible-feel via opacity */}
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

      {/* Unknown statuses — debug only */}
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
  return (
    <li className={`rounded-xl border border-gray-200 bg-white shadow-sm ${compact ? "px-4 py-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start gap-3">
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-gray-900 ${compact ? "text-sm" : "text-sm"}`}>
            {ticket.subject}
          </p>
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

        {/* Right: status selector */}
        <div className="flex-shrink-0 pt-0.5">
          <TicketStatusSelect ticketId={ticket.id} currentStatus={ticket.status as TicketStatus} />
        </div>
      </div>
    </li>
  );
}
