import { describe, it, expect, beforeEach, vi } from "vitest";

const memStore: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => memStore[k] ?? null,
      setItem: (k: string, v: string) => { memStore[k] = v; },
      removeItem: (k: string) => { delete memStore[k]; },
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
    dispatchEvent: () => true,
  });
});

import { hasConsent } from "../gate";

describe("hasConsent", () => {
  it("returns false when no record exists", () => {
    expect(hasConsent("analytics")).toBe(false);
  });

  it("returns the value of the requested category", () => {
    memStore["icareeros.consent.v1"] = JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      necessary: true,
      functional: true,
      analytics: false,
      marketing: true,
      gpcDetected: false,
    });
    expect(hasConsent("functional")).toBe(true);
    expect(hasConsent("analytics")).toBe(false);
    expect(hasConsent("marketing")).toBe(true);
  });

  it("returns false on malformed records", () => {
    memStore["icareeros.consent.v1"] = "not-json";
    expect(hasConsent("analytics")).toBe(false);
  });
});
