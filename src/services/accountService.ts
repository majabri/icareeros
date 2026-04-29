/**
 * iCareerOS — Account Service
 * Client-side helpers for data export and account deletion.
 */

/**
 * Trigger a data export download.
 * Navigates to /api/settings/export which responds with Content-Disposition: attachment.
 */
export function triggerDataExport(): void {
  window.location.href = "/api/settings/export";
}

export interface DeleteAccountResult {
  deleted: boolean;
}

/**
 * Permanently delete the current user's account.
 * Requires confirmation string "DELETE".
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const res = await fetch("/api/settings/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const data = await res.json() as { deleted?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to delete account");
  return { deleted: data.deleted ?? false };
}
