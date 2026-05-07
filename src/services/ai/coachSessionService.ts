/**
 * Coach Mode B client helpers — wrap the streaming /api/career-os/coach-session
 * route so the UI doesn't have to deal with SSE parsing inline.
 *
 * Phase 3 Item 2 — see docs/specs/COWORK-BRIEF-phase3-v1.md.
 * Phase 4: SSE-reader logic extracted to src/lib/sseStreamReader.ts so
 * Interview Mode B and other future surfaces can share it.
 */

import { readSseStream } from "@/lib/sseStreamReader";

export type CoachRole = "user" | "assistant";
export interface CoachMessage { role: CoachRole; content: string; ts: string; }

export interface CoachSessionListEntry {
  id:               string;
  cycle_id:         string | null;
  created_at:       string;
  last_message_at:  string;
  message_count:    number;
  summary:          string | null;
}

export interface CoachSessionDetail extends CoachSessionListEntry {
  messages: CoachMessage[];
}

export interface StreamCoachMessageOpts {
  cycleId:     string;
  message:     string;
  sessionId?:  string | null;
  onSession?:  (sessionId: string) => void;          // first frame
  onChunk?:    (text: string, full: string) => void; // each delta
  onDone?:     (summary: { message_count: number }) => void;
  onError?:    (message: string) => void;
}

export interface StreamResult {
  sessionId: string;
  fullText:  string;
  status:    "ok" | "rate_limited" | "upgrade_required" | "error" | "auth_required";
  meta?:     { limit?: number; used?: number; resetsAt?: string | null };
}

/** POST /api/career-os/coach-session and stream the response. */
export async function streamCoachMessage(opts: StreamCoachMessageOpts): Promise<StreamResult> {
  let resolvedSessionId = opts.sessionId ?? "";
  let fullText = "";

  const result = await readSseStream({
    url:  "/api/career-os/coach-session",
    body: {
      cycle_id:   opts.cycleId,
      message:    opts.message,
      session_id: opts.sessionId ?? null,
    },
    onEvent: ({ event, data }) => {
      if (event === "session" && data && typeof data === "object" && "session_id" in data) {
        resolvedSessionId = String((data as { session_id: string }).session_id);
        opts.onSession?.(resolvedSessionId);
      } else if (event === "message" && data && typeof data === "object" && "text" in data) {
        const t = String((data as { text: string }).text);
        fullText += t;
        opts.onChunk?.(t, fullText);
      } else if (event === "done" && data && typeof data === "object") {
        const mc = (data as { message_count?: number }).message_count;
        opts.onDone?.({ message_count: typeof mc === "number" ? mc : 0 });
      } else if (event === "error") {
        const m = data && typeof data === "object" && "error" in data
          ? String((data as { error: string }).error)
          : "stream error";
        opts.onError?.(m);
      }
    },
  });

  if (result.status === "auth_required") {
    opts.onError?.("Sign in required.");
    return { sessionId: resolvedSessionId, fullText: "", status: "auth_required" };
  }
  if (result.status === "upgrade_required") {
    const msg = (result.errorBody?.message as string | undefined) ?? "Upgrade required.";
    opts.onError?.(msg);
    return { sessionId: resolvedSessionId, fullText: "", status: "upgrade_required" };
  }
  if (result.status === "rate_limited") {
    opts.onError?.("You've used all your sessions for this month.");
    return {
      sessionId: resolvedSessionId, fullText: "", status: "rate_limited",
      meta: {
        limit:    result.errorBody?.limit    as number | undefined,
        used:     result.errorBody?.used     as number | undefined,
        resetsAt: result.errorBody?.resetsAt as string | null | undefined,
      },
    };
  }
  if (result.status === "error") {
    opts.onError?.(`HTTP ${result.httpCode}`);
    return { sessionId: resolvedSessionId, fullText, status: "error" };
  }

  return { sessionId: resolvedSessionId, fullText, status: "ok" };
}

/** GET /api/career-os/coach-session — list the user's recent sessions. */
export async function listCoachSessions(): Promise<CoachSessionListEntry[]> {
  const res = await fetch("/api/career-os/coach-session");
  if (!res.ok) return [];
  const body = (await res.json()) as { sessions?: CoachSessionListEntry[] };
  return body.sessions ?? [];
}

/** GET /api/career-os/coach-session/[id] — fetch a session with full messages. */
export async function getCoachSession(id: string): Promise<CoachSessionDetail | null> {
  const res = await fetch(`/api/career-os/coach-session/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { session?: CoachSessionDetail };
  return body.session ?? null;
}
