// ─────────────────────────────────────────────────────────────────────────────
// Job Alert Service
// Thin wrapper around the /api/job-alerts REST endpoints.
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertSubscription {
  id: string;
  query: string | null;
  is_remote: boolean;
  job_type: string | null;
  frequency: "daily" | "weekly";
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
}

export interface AlertPreferences {
  query?: string;
  is_remote?: boolean;
  job_type?: string;
  frequency?: "daily" | "weekly";
}

/** Fetch the current user's alert subscription (null if none exists). */
export async function fetchAlertSubscription(): Promise<AlertSubscription | null> {
  const res = await fetch("/api/job-alerts");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to fetch alert subscription");
  }
  const data = await res.json();
  return data.subscription as AlertSubscription | null;
}

/** Create or update the current user's alert subscription. */
export async function saveAlertSubscription(prefs: AlertPreferences): Promise<AlertSubscription> {
  const res = await fetch("/api/job-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to save alert subscription");
  }
  const data = await res.json();
  return data.subscription as AlertSubscription;
}

/** Deactivate (soft-delete) the current user's alert subscription. */
export async function deleteAlertSubscription(): Promise<void> {
  const res = await fetch("/api/job-alerts", { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to delete alert subscription");
  }
}
