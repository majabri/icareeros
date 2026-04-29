/**
 * /support — Support Inbox
 * Submit tickets + view ticket history.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchMyTickets,
  createTicket,
  statusLabel,
  statusBadgeClass,
  priorityBadgeClass,
  type SupportTicket,
  type TicketPriority,
} from "@/services/supportService";

const PRIORITIES: { value: TicketPriority; label: string; emoji: string }[] = [
  { value: "low",    label: "Low",    emoji: "🟢" },
  { value: "normal", label: "Normal", emoji: "🔵" },
  { value: "high",   label: "High",   emoji: "🟠" },
  { value: "urgent", label: "Urgent", emoji: "🔴" },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMyTickets();
      setTickets(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const ticket = await createTicket({ subject, body, priority });
      setTickets(prev => [ticket, ...prev]);
      setSubject("");
      setBody("");
      setPriority("normal");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="mt-1 text-sm text-gray-500">
          Have a question or found a bug? We typically respond within 24 hours.
        </p>
      </div>

      {/* New ticket form */}
      <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Submit a ticket</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject */}
          <div>
            <label htmlFor="subject" className="mb-1 block text-sm font-medium text-gray-700">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              minLength={5}
              maxLength={200}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="mb-1 block text-sm font-medium text-gray-700">
              Details
            </label>
            <textarea
              id="body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour, screenshots if possible."
              minLength={10}
              maxLength={5000}
              required
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{body.length}/5000</p>
          </div>

          {/* Priority */}
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Priority</span>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors
                    ${priority === value
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  <span>{emoji}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{submitError}</p>
          )}

          {submitted && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              ✓ Ticket submitted — we&apos;ll get back to you soon.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      </section>

      {/* Ticket history */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-800">My tickets</h2>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="animate-spin">⏳</span> Loading…
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && tickets.length === 0 && (
          <p className="text-sm text-gray-500">No tickets yet.</p>
        )}

        {!loading && !error && tickets.length > 0 && (
          <ul className="space-y-3">
            {tickets.map(ticket => (
              <li
                key={ticket.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}
                  >
                    {statusLabel(ticket.status)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(ticket.priority)}`}
                  >
                    {ticket.priority}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{ticket.subject}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{ticket.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
