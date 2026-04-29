import { createClient } from "@/lib/supabase";

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

/** Generate a pre-session interview prep guide via the generate-interview-prep edge fn. */
export async function generateInterviewPrep(opts: {
  jobTitle: string;
  jobDescription: string;
  resume?: string;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("generate-interview-prep", {
    body: {
      jobDescription: opts.jobDescription || `Position: ${opts.jobTitle}`,
      resume:
        opts.resume?.trim() ||
        `Experienced professional applying for the ${opts.jobTitle} role.`,
      matchedSkills: [],
      gaps: [],
    },
  });
  if (error) throw new Error(error.message ?? "generate-interview-prep failed");
  if (typeof data?.content !== "string" || !data.content) {
    throw new Error("No prep content returned");
  }
  return data.content as string;
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
