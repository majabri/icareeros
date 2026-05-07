"use client";

/**
 * CoachChatWindow — the main /coach interface.
 *
 * Wires the streaming POST → ReadableStream client helper from
 * coachSessionService. Owns the conversation state for the active session
 * (messages list + currently-streaming assistant content) and exposes a
 * lightweight session picker so the user can resume past sessions.
 *
 * Phase 3 Item 3 — see docs/specs/COWORK-BRIEF-phase3-v1.md.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  streamCoachMessage,
  listCoachSessions,
  getCoachSession,
  type CoachMessage,
  type CoachSessionListEntry,
} from "@/services/ai/coachSessionService";
import { CoachMessageBubble } from "./CoachMessageBubble";
import { CoachSessionList }    from "./CoachSessionList";

interface CoachChatWindowProps {
  cycleId: string;
}

export function CoachChatWindow({ cycleId }: CoachChatWindowProps) {
  const [sessions, setSessions]       = useState<CoachSessionListEntry[]>([]);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [messages, setMessages]       = useState<CoachMessage[]>([]);
  const [streaming, setStreaming]     = useState<string | null>(null);
  const [draft, setDraft]             = useState("");
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Initial load — fetch session list, optionally hydrate the most recent
  useEffect(() => {
    void (async () => {
      const list = await listCoachSessions();
      setSessions(list);
      // Auto-resume only if last session is < 7 days old
      const recent = list[0];
      if (recent && Date.now() - Date.parse(recent.last_message_at) < 7 * 86_400_000) {
        await pickSession(recent.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new content
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function pickSession(id: string | null) {
    if (id === null) {
      setActiveId(null);
      setMessages([]);
      setStreaming(null);
      setError(null);
      return;
    }
    const detail = await getCoachSession(id);
    if (!detail) return;
    setActiveId(id);
    setMessages(detail.messages ?? []);
    setStreaming(null);
    setError(null);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    setStreaming("");
    const userMsg: CoachMessage = { role: "user", content: text, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    const result = await streamCoachMessage({
      cycleId,
      message: text,
      sessionId: activeId,
      onSession: (id) => { if (!activeId) setActiveId(id); },
      onChunk:   (_chunk, full) => setStreaming(full),
      onDone:    () => { /* finalize after loop */ },
      onError:   (m) => setError(m),
    });

    if (result.status === "ok") {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: result.fullText, ts: new Date().toISOString() },
      ]);
      // refresh session list (count + last_message_at probably bumped)
      const list = await listCoachSessions();
      setSessions(list);
    } else {
      // remove the just-appended user message on hard failure so the user can retry
      setMessages(prev => prev.filter(m => m !== userMsg));
    }
    setStreaming(null);
    setBusy(false);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const streamingMsg: CoachMessage | null = streaming !== null
    ? { role: "assistant", content: streaming, ts: "" }
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] gap-3">
      {/* Session picker */}
      <CoachSessionList
        sessions={sessions}
        activeSessionId={activeId}
        onPick={(id) => void pickSession(id)}
      />

      {/* Message scroller */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4"
        data-testid="coach-chat-scroller"
      >
        {messages.length === 0 && !streamingMsg && (
          <p className="text-sm text-gray-400 text-center mt-8">
            Start a conversation. Ask about your next move, prep for an interview, or talk through a setback.
          </p>
        )}
        {messages.map((m, i) => (
          <CoachMessageBubble key={i} msg={m} />
        ))}
        {streamingMsg && <CoachMessageBubble msg={streamingMsg} streaming />}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask your coach… (⌘/Ctrl+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
