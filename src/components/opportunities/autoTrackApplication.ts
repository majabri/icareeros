/**
 * feat/jobs-smart-apply — Auto-track logic extracted to a non-JSX
 * module so vitest's transformer can parse it during unit tests
 * without pulling in React/JSX.
 */
import { createClient } from "@/lib/supabase";

export interface AutoTrackInput {
  job_title:      string;
  company:        string;
  job_url:        string;
  opportunity_id: string | null;
  cycle_id:       string | null;
}

export type AutoTrackResult =
  | { ok: true;  applicationId: string }
  | { ok: false; error: string };

export async function autoTrackApplication(input: AutoTrackInput): Promise<AutoTrackResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  // Dedupe by (user_id, job_url).
  const existing = input.job_url
    ? await supabase
        .from("applications")
        .select("id")
        .eq("user_id", user.id)
        .eq("job_url", input.job_url)
        .maybeSingle()
    : { data: null };

  let applicationId = existing?.data?.id;
  if (applicationId) {
    await supabase
      .from("applications")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", applicationId);
  } else {
    const inserted = await supabase
      .from("applications")
      .insert({
        user_id:        user.id,
        job_title:      input.job_title,
        company:        input.company,
        job_url:        input.job_url,
        status:         "applied",
        applied_at:     new Date().toISOString(),
        cycle_id:       input.cycle_id,
        opportunity_id: input.opportunity_id,
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) return { ok: false, error: inserted.error?.message ?? "insert failed" };
    applicationId = inserted.data.id;
  }

  // Best-effort event log. Errors swallowed so the tracking result stands.
  try {
    await supabase.from("application_events").insert({
      user_id:        user.id,
      application_id: applicationId,
      event_type:     "applied",
      metadata:       { source: "smart-apply" },
    });
  } catch { /* silent */ }

  return { ok: true, applicationId };
}
