import type { ConsentRecord } from "./storage";

export type ConsentEventKind = "cookie" | "tos";

export async function postConsent(record: ConsentRecord, kind: ConsentEventKind = "cookie"): Promise<void> {
  try {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: record.version,
        kind,
        necessary: record.necessary,
        functional: record.functional,
        analytics: record.analytics,
        marketing: record.marketing,
        gpcDetected: record.gpcDetected,
      }),
      // Best-effort; consent works even if the POST fails.
      keepalive: true,
    });
  } catch {
    // Swallow — local state is the source of truth.
  }
}
