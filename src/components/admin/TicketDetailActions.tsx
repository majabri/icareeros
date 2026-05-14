"use client";

/**
 * Sprint 4 W3-C — Inline reply textarea + internal note textarea for the
 * ticket detail view. Each tab uses its own server action (sendTicketReply
 * vs addTicketInternalNote) and both audit-log via Sprint 4 W1.
 */

import { useState, useTransition } from "react";
import { sendTicketReply, addTicketInternalNote } from "@/app/actions/adminActions";

type Tab = "reply" | "note";

export interface TicketDetailActionsProps {
  ticketId:  string;
  userEmail: string;
  subject:   string;
}

export default function TicketDetailActions({ ticketId, userEmail, subject }: TicketDetailActionsProps) {
  const [tab, setTab]       = useState<Tab>("reply");
  const [reply, setReply]   = useState("");
  const [note,  setNote]    = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const result = tab === "reply"
        ? await sendTicketReply(ticketId, reply)
        : await addTicketInternalNote(ticketId, note);
      if (result?.error) {
        setStatus({ kind: "err", msg: result.error });
      } else {
        setStatus({ kind: "ok", msg: tab === "reply" ? "Reply sent" : "Note added" });
        if (tab === "reply") setReply(""); else setNote("");
      }
    });
  }

  const sample = tab === "reply" ? reply : note;
  const setSample = tab === "reply" ? setReply : setNote;
  const placeholder = tab === "reply"
    ? `Reply to ${userEmail} (re: ${subject})…`
    : "Internal note (only admins see this)…";
  const submitLabel = tab === "reply" ? "Send reply" : "Add note";

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] overflow-hidden">
      <div className="flex border-b border-gray-200 dark:border-[var(--surface-border,#243653)]">
        <TabButton active={tab === "reply"} onClick={() => setTab("reply")}>
          ✉ Reply to user
        </TabButton>
        <TabButton active={tab === "note"}  onClick={() => setTab("note")}>
          📓 Internal note
        </TabButton>
      </div>

      <form onSubmit={submit} className="p-4 space-y-3">
        {tab === "reply" && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Sends an email to <span className="font-mono">{userEmail}</span> via Bluehost SMTP and appends a `[REPLY]` entry to conversation history. If the ticket is currently <strong>Open</strong>, sending a reply automatically bumps status to <strong>In Progress</strong>.
          </div>
        )}
        {tab === "note" && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Internal-only — never sent to the user. Appears as a `[NOTE]` entry in conversation history.
          </div>
        )}

        <textarea
          value={sample}
          onChange={e => setSample(e.target.value)}
          placeholder={placeholder}
          required
          minLength={tab === "reply" ? 5 : 2}
          rows={6}
          disabled={pending}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 disabled:opacity-60"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || sample.trim().length < (tab === "reply" ? 5 : 2)}
            className="inline-flex items-center rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Sending…" : submitLabel}
          </button>

          {status.kind === "ok"  && <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">✓ {status.msg}</span>}
          {status.kind === "err" && <span className="text-sm font-medium text-rose-700 dark:text-rose-300">✗ {status.msg}</span>}
        </div>
      </form>
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "bg-gray-50 text-gray-900 border-b-2 border-brand-600 dark:bg-white/5 dark:text-gray-100"
          : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
