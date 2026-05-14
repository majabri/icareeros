import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { priorityBadgeClass } from "@/services/supportService";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import { TicketStatusSelect } from "@/components/admin/TicketStatusSelect";
import TicketDetailActions from "@/components/admin/TicketDetailActions";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ticket ${id.slice(0, 8)} — iCareerOS Admin` };
}

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AdminNoteEntry {
  kind:   "reply" | "note" | "raw";
  ts:     string | null;
  author: string | null;
  body:   string;
}

/**
 * Parse the `admin_notes` text field into structured entries.
 * Each entry begins with `[REPLY <iso-ts> by <email>]` or `[NOTE <iso-ts> by <email>]`.
 * Raw / unparseable content from before Sprint 4 W3-C lands as `kind: 'raw'`.
 */
function parseAdminNotes(notes: string | null): AdminNoteEntry[] {
  if (!notes) return [];
  const re = /\[(REPLY|NOTE)\s+([0-9TZ:.-]+)\s+by\s+([^\]]+)\]/g;
  const entries: AdminNoteEntry[] = [];
  const matches = [...notes.matchAll(re)];

  if (matches.length === 0) {
    // Pre-Sprint-4 raw content
    return [{ kind: "raw", ts: null, author: null, body: notes.trim() }];
  }

  // Any content before the first header is raw legacy notes
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    const head = notes.slice(0, firstIdx).trim();
    if (head) entries.push({ kind: "raw", ts: null, author: null, body: head });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const startBody = (m.index ?? 0) + m[0].length;
    const endBody   = next ? next.index : notes.length;
    const body      = notes.slice(startBody, endBody).trim();
    entries.push({
      kind:   m[1] === "REPLY" ? "reply" : "note",
      ts:     m[2],
      author: m[3].trim(),
      body,
    });
  }
  return entries;
}

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const svc = makeSvc();

  const { data: ticket } = await svc
    .from("support_tickets")
    .select("id, ticket_number, subject, body, description, priority, status, category, created_at, updated_at, user_id, classification, classifier_confidence, devops_tier, suggested_response, admin_notes, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  // Look up user info
  const [{ data: profile }, { data: { user: authUser } }] = await Promise.all([
    svc.from("profiles").select("email, full_name, role, admin_role, created_at").eq("user_id", ticket.user_id).maybeSingle(),
    svc.auth.admin.getUserById(ticket.user_id),
  ]);

  const messageBody = (ticket.body ?? ticket.description ?? "").trim();
  const entries     = parseAdminNotes(ticket.admin_notes ?? null);
  const userEmail   = authUser?.email ?? profile?.email ?? "(unknown)";
  const userName    = profile?.full_name ?? "—";
  const tier        = ticket.devops_tier;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <div>
        <Link href="/admin/tickets" className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← back to inbox
        </Link>
        <AdminPageHeader
          title={ticket.subject}
          description={
            <>
              <code className="text-[11px] font-mono text-gray-500">
                {ticket.ticket_number ?? ticket.id.slice(0, 8)}
              </code>{" "}
              · opened {new Date(ticket.created_at).toLocaleString()}
              {ticket.resolved_at && (
                <> · resolved {new Date(ticket.resolved_at).toLocaleString()}</>
              )}
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityBadgeClass(ticket.priority as TicketPriority)}`}>
                {ticket.priority}
              </span>
              <TicketStatusSelect ticketId={ticket.id} currentStatus={ticket.status as TicketStatus} />
            </div>
          }
        />
      </div>

      {/* User info */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Reporter</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">{userName}</span>
          <a href={`mailto:${userEmail}`} className="text-brand-600 hover:underline">{userEmail}</a>
          {profile?.role && (
            <span className="text-xs uppercase tracking-wide text-gray-500">role: {profile.role}</span>
          )}
          {profile?.admin_role && (
            <span className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">admin: {profile.admin_role}</span>
          )}
          <span className="text-xs text-gray-400">uid {ticket.user_id.slice(0, 8)}</span>
          <Link
            href={`/admin/users?q=${encodeURIComponent(userEmail)}`}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            View in user list →
          </Link>
        </div>
      </section>

      {/* Original message */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Original message</h2>
        <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {messageBody || <span className="italic text-gray-400">(no body)</span>}
        </p>
      </section>

      {/* AI analysis (if present) */}
      {ticket.classification && (
        <section className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:bg-purple-500/5 dark:border-purple-500/20">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-2">AI analysis · Haiku</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-purple-100 dark:bg-purple-500/20 px-2 py-0.5 text-purple-700 dark:text-purple-200 font-medium">{ticket.classification}</span>
            {tier && <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-amber-700 dark:text-amber-200 font-semibold">{tier}</span>}
            {ticket.classifier_confidence != null && (
              <span className="text-gray-500 dark:text-gray-400">{(ticket.classifier_confidence * 100).toFixed(0)}% confidence</span>
            )}
          </div>
          {ticket.suggested_response && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-purple-700 dark:text-purple-300 hover:text-purple-900 select-none">
                Suggested response (use as starter; edit before sending)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-500/20 px-3 py-2 text-gray-800 dark:text-gray-200 font-sans leading-relaxed">{ticket.suggested_response}</pre>
            </details>
          )}
        </section>
      )}

      {/* Conversation history (replies + internal notes) */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">
          Conversation history
          <span className="ml-2 text-xs font-normal text-gray-400">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </span>
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:bg-[var(--surface-card,#162338)]/30 dark:border-[var(--surface-border,#243653)] dark:text-gray-400">
            No replies or internal notes yet. Use the form below to start the conversation.
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((e, i) => (
              <li
                key={i}
                className={`rounded-xl border p-4 ${
                  e.kind === "reply"
                    ? "border-blue-200 bg-blue-50/50 dark:bg-blue-500/5 dark:border-blue-500/20"
                    : e.kind === "note"
                      ? "border-amber-200 bg-amber-50/50 dark:bg-amber-500/5 dark:border-amber-500/20"
                      : "border-gray-200 bg-white dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]"
                }`}
              >
                <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] mb-2">
                  <span className={`font-semibold uppercase tracking-wider ${
                    e.kind === "reply" ? "text-blue-700 dark:text-blue-300"
                    : e.kind === "note"  ? "text-amber-700 dark:text-amber-300"
                    : "text-gray-500"
                  }`}>
                    {e.kind === "reply" ? "✉ Reply to user" : e.kind === "note" ? "📓 Internal note" : "Legacy notes"}
                  </span>
                  {e.author && <span className="text-gray-500 dark:text-gray-400">by {e.author}</span>}
                  {e.ts && <time className="text-gray-400 dark:text-gray-500" dateTime={e.ts}>{new Date(e.ts).toLocaleString()}</time>}
                </header>
                <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reply + internal note actions */}
      <TicketDetailActions ticketId={ticket.id} userEmail={userEmail} subject={ticket.subject} />
    </div>
  );
}
