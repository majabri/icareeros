import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { statusBadgeClass, statusLabel, priorityBadgeClass } from "@/services/supportService";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Support Inbox — iCareerOS Admin" };

interface AdminTicket { id: string; subject: string; body: string; priority: TicketPriority; status: TicketStatus; created_at: string; user_id: string; }

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
    },
  });
}

export default async function AdminTicketsPage() {
  const supabase = await makeSupabaseServer();
  const { data: tickets } = await supabase.from("support_tickets")
    .select("id, subject, body, priority, status, created_at, user_id")
    .order("created_at", { ascending: false }).limit(100);

  const all = (tickets ?? []) as AdminTicket[];
  const open = all.filter(t => t.status === "open" || t.status === "in_progress");
  const closed = all.filter(t => t.status === "resolved" || t.status === "closed");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">{open.length} open · {closed.length} resolved · {all.length} total</p>
      </div>
      {open.length === 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-10 text-center text-sm text-green-700 mb-6">
          🎉 No open tickets — inbox is clear.
        </div>
      )}
      {open.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Open / In Progress ({open.length})</h2>
          <ul className="space-y-3">
            {open.map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                  <span className="ml-auto text-xs text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-medium text-gray-900">{ticket.subject}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-3">{ticket.body}</p>
                <p className="mt-2 font-mono text-xs text-gray-400">uid: {ticket.user_id}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Resolved / Closed ({closed.length})</h2>
          <ul className="space-y-2">
            {closed.slice(0, 20).map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                <p className="text-sm text-gray-600 truncate">{ticket.subject}</p>
                <span className="ml-auto text-xs text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
