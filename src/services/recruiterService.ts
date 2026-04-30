/**
 * Recruiter assistant service — wraps /api/recruiter
 */

export interface ScreeningQuestion {
  question: string;
  what_to_listen_for: string;
}

export interface RecruiterAnalysis {
  ideal_candidate: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  screening_questions: ScreeningQuestion[];
  red_flags: string[];
  compensation_notes: string;
}

export interface RecruiterResult {
  analysis?: RecruiterAnalysis;
  error?: string;
}

export async function analyseJobDescription(
  jobDescription: string,
  companyName?: string
): Promise<RecruiterResult> {
  try {
    const res = await fetch("/api/recruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_description: jobDescription, company_name: companyName }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Request failed" };
    return { analysis: data.analysis as RecruiterAnalysis };
  } catch {
    return { error: "Network error" };
  }
}
