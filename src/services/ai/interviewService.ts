import { createClient } from "@/lib/supabase";

export type InterviewMessage = { role: "user" | "assistant"; content: string };

export interface InterviewSession {
  id: string;
  job_title: string;
  messages: InterviewMessage[];
  readiness_score: number | null;
  created_at: string;
}

/** Call the mock-interview edge function with the current conversation history. */
export async function sendInterviewMessage(opts: {
  messages: InterviewMessage[];
  jobTitle: string;
  jobDescription?: string;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("mock-interview", {
    body: {
      messages: opts.messages,
      jobTitle: opts.jobTitle,
      ...(opts.jobDescription ? { jobDescription: opts.jobDescription } : {}),
    },
  });
  if (error) throw new Error(error.message ?? "mock-interview failed");
  const content = data?.content;
  if (typeof content !== "string" || !content) {
    throw new Error("No content returned from interview");
  }
  return content;
}

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

/**
 * Parse the readiness score from the Claude summary line, e.g.
 * "**Overall Readiness: 78%**"
 */
export function extractReadinessScore(content: string): number | null {
  const match = content.match(/Overall Readiness[:\s]+(\d+)%/i);
  return match ? parseInt(match[1], 10) : null;
}
