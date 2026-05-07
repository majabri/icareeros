/**
 * Coach Mode B client helpers — wrap the streaming /api/career-os/coach-session
 * route so the UI doesn't have to deal with SSE parsing inline.
 *
 * Phase 3 Item 2 — see docs/specs/COWORK-BRIEF-phase3-v1.md.
 */

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
  const res = await fetch("/api/career-os/coach-session", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      cycle_id:   opts.cycleId,
      message:    opts.message,
      session_id: opts.sessionId ?? null,
    }),
  });

  if (res.status === 401) {
    opts.onError?.("Sign in required.");
    return { sessionId: opts.sessionId ?? "", fullText: "", status: "auth_required" };
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    opts.onError?.(body?.message ?? "Upgrade required.");
    return { sessionId: opts.sessionId ?? "", fullText: "", status: "upgrade_required" };
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    opts.onError?.("You've used all your sessions for this month.");
    return {
      sessionId: opts.sessionId ?? "", fullText: "", status: "rate_limited",
      meta: { limit: body.limit, used: body.used, resetsAt: body.resetsAt },
    };
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    opts.onError?.(body || `HTTP ${res.status}`);
    return { sessionId: opts.sessionId ?? "", fullText: "", status: "error" };
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer    = "";
  let fullText  = "";
  let resolvedSessionId = opts.sessionId ?? "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames end with a blank line. Split on \n\n, keep partial in buffer.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n").filter(Boolean);
      let event = "message";
      const data: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(data.join("\n")); } catch { continue; }

      if (event === "session" && parsed && typeof parsed === "object" && "session_id" in parsed) {
        resolvedSessionId = String((parsed as { session_id: string }).session_id);
        opts.onSession?.(resolvedSessionId);
      } else if (event === "message" && parsed && typeof parsed === "object" && "text" in parsed) {
        const t = String((parsed as { text: string }).text);
        fullText += t;
        opts.onChunk?.(t, fullText);
      } else if (event === "done" && parsed && typeof parsed === "object") {
        const mc = (parsed as { message_count?: number }).message_count;
        opts.onDone?.({ message_count: typeof mc === "number" ? mc : 0 });
      } else if (event === "error") {
        const m = parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: string }).error)
          : "stream error";
        opts.onError?.(m);
        return { sessionId: resolvedSessionId, fullText, status: "error" };
      }
    }
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
