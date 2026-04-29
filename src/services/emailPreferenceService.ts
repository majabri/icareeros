/**
 * iCareerOS — Email Preference Service
 * Client-side wrapper around GET/POST /api/email/preferences.
 */

export interface EmailPreferences {
  id: string;
  weekly_insights: boolean;
  job_alerts: boolean;
  marketing: boolean;
  unsubscribe_token: string;
  updated_at: string;
}

export interface DefaultPreferences {
  weekly_insights: true;
  job_alerts: true;
  marketing: false;
}

export const DEFAULT_PREFERENCES: DefaultPreferences = {
  weekly_insights: true,
  job_alerts: true,
  marketing: false,
};

/** Fetch the current user's email preferences. Returns null if not yet saved (use defaults). */
export async function fetchEmailPreferences(): Promise<EmailPreferences | null> {
  const res = await fetch("/api/email/preferences");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch email preferences");
  }
  const data = await res.json() as { preferences: EmailPreferences | null };
  return data.preferences;
}

/** Update the current user's email preferences (partial update supported). */
export async function updateEmailPreferences(
  update: Partial<Pick<EmailPreferences, "weekly_insights" | "job_alerts" | "marketing">>,
): Promise<EmailPreferences> {
  const res = await fetch("/api/email/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  const data = await res.json() as { preferences?: EmailPreferences; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to update email preferences");
  return data.preferences!;
}
