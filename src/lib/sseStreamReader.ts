/**
 * Shared SSE stream reader for client-side streaming routes.
 *
 * Contract (server side — see /api/career-os/coach-session/route.ts):
 *   event: <eventName>
 *   data: <single-line JSON>
 *   <blank line>
 *
 * Client gets back a Promise that resolves once the stream ends. Per-frame
 * event names are dispatched to the caller's `onEvent` handler. The reader
 * also surfaces non-200 status codes via `status` so callers can handle
 * 401 / 403 / 429 / 5xx without parsing the body.
 *
 * Extracted from src/services/ai/coachSessionService.ts (Phase 3) so the
 * Interview rebuild (Phase 4) and any future streaming chat surface can
 * share the same reader. Behaviour for Coach Mode B is unchanged.
 */

export type SseStatus = "ok" | "auth_required" | "upgrade_required" | "rate_limited" | "error";

export interface SseEvent {
  event: string;
  /** Parsed JSON payload, or the raw string if JSON.parse failed. */
  data:  unknown;
}

export interface SseStreamOpts {
  url:                string;
  body:               unknown;
  /** Per-frame dispatcher. Called for every parsable SSE event. */
  onEvent?:           (e: SseEvent) => void;
  /** Optional shortcut for plain `data: { text: "..." }` frames. */
  onText?:            (chunk: string) => void;
  /** Caller can preempt status handling; return true to mark "handled". */
  onNonOkStatus?:     (status: number, body: Record<string, unknown>) => boolean | void;
}

export interface SseStreamResult {
  status:    SseStatus;
  /** Raw HTTP status from the fetch — useful for debug/telemetry. */
  httpCode:  number;
  /** Server payload for non-200 responses (e.g. {error, limit, used, ...}) */
  errorBody?: Record<string, unknown>;
}

/**
 * Issue a streaming POST and dispatch SSE frames. Resolves when the stream
 * ends or the connection drops. Never throws on stream parse errors —
 * malformed frames are silently skipped (log on server side instead).
 */
export async function readSseStream(opts: SseStreamOpts): Promise<SseStreamResult> {
  const res = await fetch(opts.url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(opts.body),
  });

  if (res.status !== 200) {
    let parsed: Record<string, unknown> = {};
    try { parsed = (await res.json()) as Record<string, unknown>; } catch { /* ignore */ }
    const handled = opts.onNonOkStatus?.(res.status, parsed);
    if (handled === true) {
      return { status: "ok", httpCode: res.status, errorBody: parsed };
    }
    const status: SseStatus =
      res.status === 401 ? "auth_required"
      : res.status === 403 ? "upgrade_required"
      : res.status === 429 ? "rate_limited"
      : "error";
    return { status, httpCode: res.status, errorBody: parsed };
  }
  if (!res.body) {
    return { status: "error", httpCode: res.status };
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

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
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const raw = dataLines.join("\n");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      opts.onEvent?.({ event, data: parsed });
      if (opts.onText && event === "message" && parsed && typeof parsed === "object" && "text" in (parsed as object)) {
        opts.onText(String((parsed as { text: string }).text));
      }
    }
  }
  return { status: "ok", httpCode: 200 };
}
