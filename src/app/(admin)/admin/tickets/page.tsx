/**
 * /admin/tickets — Support inbox.
 * Uses service-role client to bypass RLS and see ALL tickets regardless of owner.
 */

import { createClient } from "@supabase/supabase-js";
import { statusBadgeClass, statusLabel, priorityBadgeClass } from "@/services/supportService";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support Inbox — iCareerOS Admin" };

interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  user_id: string;
}

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function AdminTicketsPage() {
  const svc = makeSvc();

  const { data: tickets, error } = await svc
    .from("support_tickets")
    .select("id, subject, body, priority, status, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(200);

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

  const all    = (tickets ?? []) as AdminTicket[];
  const open   = all.filter(t => t.status === "open" || t.status === "in_progress");
  const closed = all.filter(t => t.status === "resolved" || t.status === "closed");
  // catch any unexpected statuses
  const other  = all.filter(t => !["open","in_progress","resolved","closed"].includes(t.status));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          {open.length} open · {closed.length} resolved · {all.length} total
        </p>
      </div>

      {/* Open tickets */}
      {open.length === 0 && other.length === 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-8 text-center text-sm text-green-700 mb-6">
          🎉 No open tickets — inbox is clear.
        </div>
      )}

      {open.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Open / In Progress ({open.length})
          </h2>
          <ul className="space-y-3">
            {open.map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}>
                    {statusLabel(ticket.status)}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{ticket.subject}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-4">{ticket.body}</p>
                <p className="mt-2 font-mono text-xs text-gray-400">uid: {ticket.user_id}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Unexpected statuses — debug only */}
      {other.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">
            Unknown Status ({other.length})
          </h2>
          <ul className="space-y-2">
            {other.map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{ticket.subject}</p>
                <p className="text-xs text-amber-700 font-mono">status: {ticket.status} · uid: {ticket.user_id}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Resolved/Closed */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Resolved / Closed ({closed.length})
          </h2>
          <ul className="space-y-2">
            {closed.map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}>
                  {statusLabel(ticket.status)}
                </span>
                <p className="text-sm text-gray-600 truncate">{ticket.subject}</p>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {all.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No tickets found in the database.
        </div>
      )}
    </div>
  );
}
