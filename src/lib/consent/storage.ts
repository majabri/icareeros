/**
 * Cookie-consent storage helpers.
 *
 * The canonical record lives in localStorage so the SPA can read it sync.
 * A mirrored first-party cookie (`cc_consent`) lets server middleware see it
 * without parsing localStorage. Schema bumps invalidate prior consent.
 */

export const CONSENT_SCHEMA_VERSION = 1 as const;
export const CONSENT_LS_KEY = "icareeros.consent.v1";
export const CONSENT_COOKIE = "cc_consent";

export type ConsentCategory = "functional" | "analytics" | "marketing";

export interface ConsentRecord {
  version: typeof CONSENT_SCHEMA_VERSION;
  timestamp: string;
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  gpcDetected: boolean;
}

export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(record: Omit<ConsentRecord, "version" | "timestamp">): ConsentRecord {
  const full: ConsentRecord = {
    ...record,
    version: CONSENT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_LS_KEY, JSON.stringify(full));
    // 12 months — matches the policy.
    const maxAge = 60 * 60 * 24 * 365;
    const value = encodeURIComponent(JSON.stringify(full));
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${
      typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
    }`;
    window.dispatchEvent(new CustomEvent("icareeros:consent-changed", { detail: full }));
  }
  return full;
}

export function clearConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONSENT_LS_KEY);
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("icareeros:consent-changed", { detail: null }));
}
