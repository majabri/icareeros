/**
 * Interview Simulator client helpers.
 *
 * Phase 4 (fix/interview-simulator) — replaces the previous edge-fn calls
 * with streaming Next.js API routes:
 *   POST /api/interview/session  — per-turn Q&A (token-by-token)
 *   POST /api/interview/prep     — pre-session prep guide (token-by-token)
 *
 * The session-storage helpers (createInterviewSession / update / list)
 * use the existing `interview_sessions` table via Supabase REST and are
 * unchanged. Storage was never broken — only the LLM-call layer was.
 */

import { createClient } from "@/lib/supabase";
import { readSseStream } from "@/lib/sseStreamReader";

export type InterviewMessage = { role: "user" | "assistant"; content: string };

export interface InterviewSession {
  id: string;
  job_title: string;
  messages: InterviewMessage[];
  readiness_score: number | null;
  created_at: string;
}

export interface SessionFeedback {
  score: number | null;
  strengths: string[];
  areasToWork: string[];
}

// ── LLM-streaming helpers (NEW in Phase 4) ──────────────────────────────────

export interface StreamingCallbacks {
  /** Called for every text delta. */
  onChunk?: (text: string, full: string) => void;
  /** Called when the stream ends successfully. */
  onDone?:  (fullText: string) => void;
  /** Called on auth/upgrade/limit/HTTP errors. */
  onError?: (message: string) => void;
}

/**
 * Per-turn interview message. Streams the assistant reply via
 * /api/interview/session and resolves with the full text after the stream
 * ends. Pass `onChunk` to render token-by-token (option b in the rebuild
 * plan); omit it for the legacy all-or-nothing display.
 */
export async function sendInterviewMessage(opts: {
  messages:        InterviewMessage[];
  jobTitle:        string;
  jobDescription?: string;
} & StreamingCallbacks): Promise<string> {
  let fullText = "";
  const result = await readSseStream({
    url:  "/api/interview/session",
    body: {
      messages:       opts.messages,
      jobTitle:       opts.jobTitle,
      jobDescription: opts.jobDescription ?? null,
    },
    onEvent: ({ event, data }) => {
      if (event === "message" && data && typeof data === "object" && "text" in data) {
        const t = String((data as { text: string }).text);
        fullText += t;
        opts.onChunk?.(t, fullText);
      } else if (event === "done") {
        opts.onDone?.(fullText);
      } else if (event === "error") {
        const m = data && typeof data === "object" && "error" in data
          ? String((data as { error: string }).error)
          : "stream error";
        opts.onError?.(m);
      }
    },
  });

  if (result.status !== "ok") {
    const reason =
      result.status === "auth_required"    ? "Sign in required."
      : result.status === "upgrade_required" ? "Interview is gated for your plan."
      : result.status === "rate_limited"     ? "Rate limit reached."
      : `Interview request failed (HTTP ${result.httpCode}).`;
    opts.onError?.(reason);
    throw new Error(reason);
  }
  if (!fullText) {
    throw new Error("No content returned from interview");
  }
  return fullText;
}

/**
 * Pre-session prep guide. Same streaming shape as sendInterviewMessage.
 * Returns the full markdown after stream completion.
 */
export async function generateInterviewPrep(opts: {
  jobTitle:       string;
  jobDescription: string;
  resume?:        string;
} & StreamingCallbacks): Promise<string> {
  let fullText = "";
  const result = await readSseStream({
    url:  "/api/interview/prep",
    body: {
      jobTitle:       opts.jobTitle,
      jobDescription: opts.jobDescription || `Position: ${opts.jobTitle}`,
      resume:         opts.resume?.trim() ?? "",
    },
    onEvent: ({ event, data }) => {
      if (event === "message" && data && typeof data === "object" && "text" in data) {
        const t = String((data as { text: string }).text);
        fullText += t;
        opts.onChunk?.(t, fullText);
      } else if (event === "done") {
        opts.onDone?.(fullText);
      } else if (event === "error") {
        const m = data && typeof data === "object" && "error" in data
          ? String((data as { error: string }).error)
          : "stream error";
        opts.onError?.(m);
      }
    },
  });

  if (result.status !== "ok") {
    const reason =
      result.status === "auth_required"    ? "Sign in required."
      : result.status === "upgrade_required" ? "Interview prep is gated for your plan."
      : result.status === "rate_limited"     ? "Rate limit reached."
      : `Prep request failed (HTTP ${result.httpCode}).`;
    opts.onError?.(reason);
    throw new Error(reason);
  }
  if (!fullText) throw new Error("No prep content returned");
  return fullText;
}

// ── Session storage (unchanged from prior implementation) ───────────────────

/** Insert a new interview_sessions row and return its id. */
export async function createInterviewSession(jobTitle: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("interview_sessions")
    .insert({ user_id: user.id, job_title: jobTitle, messages: [] })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Persist the current message history (and optional score) to Supabase. */
export async function updateInterviewSession(
  sessionId: string,
  messages: InterviewMessage[],
  readinessScore?: number,
): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { messages };
  if (readinessScore !== undefined) patch.readiness_score = readinessScore;

  const { error } = await supabase
    .from("interview_sessions")
    .update(patch)
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

/** Fetch the 10 most recent sessions for the current user. */
export async function listInterviewSessions(): Promise<InterviewSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id, job_title, messages, readiness_score, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data ?? []) as InterviewSession[];
}

// ── Score / feedback parsers (unchanged) ────────────────────────────────────

/**
 * Parse the readiness score from the Claude summary line, e.g.
 * "**Overall Readiness: 78%**"
 */
export function extractReadinessScore(content: string): number | null {
  const match = content.match(/Overall Readiness[:\s]+(\d+)%/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse the structured feedback from the final Claude summary message.
 * Extracts strengths and areas-to-work bullet lists.
 */
export function parseFinalFeedback(content: string): SessionFeedback {
  const score = extractReadinessScore(content);

  const parseBullets = (section: string | undefined): string[] => {
    if (!section) return [];
    return section
      .split("\n")
      .map((line) => line.replace(/^[\s\-*•]+/, "").replace(/\*\*/g, "").trim())
      .filter((line) => line.length > 4);
  };

  // Match everything after "Top strengths:" until the next bold header or end
  const stripped = content.replace(/\*\*/g, "");
  const strengthsMatch = stripped.match(
    /Top strengths?[:\s]*\n([\s\S]*?)(?=\n\*\*Areas|\n##|$)/i,
  );
  // Match everything after "Areas to work on:" until end or next section
  const areasMatch = stripped.match(
    /Areas? to work on[:\s]*\n([\s\S]*?)(?=\n\*\*|\n##|$)/i,
  );

  return {
    score,
    strengths: parseBullets(strengthsMatch?.[1]),
    areasToWork: parseBullets(areasMatch?.[1]),
  };
}
