import { describe, it, expect, beforeEach, vi } from "vitest";

// Recreate a minimal localStorage shim before each test.
const memStore: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => { memStore[k] = v; },
  removeItem: (k: string) => { delete memStore[k]; },
  clear: () => { Object.keys(memStore).forEach((k) => delete memStore[k]); },
  key: () => null,
  length: 0,
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("window", {
    localStorage: localStorageMock,
    dispatchEvent: () => true,
  });
  vi.stubGlobal("location", { protocol: "http:" });
  vi.stubGlobal("document", { cookie: "" });
});

import { readConsent, writeConsent, clearConsent, CONSENT_LS_KEY } from "../storage";

describe("consent storage", () => {
  it("returns null when no record exists", () => {
    expect(readConsent()).toBeNull();
  });

  it("writes and reads back a record", () => {
    const r = writeConsent({ necessary: true, functional: true, analytics: false, marketing: false, gpcDetected: false });
    expect(r.version).toBe(1);
    expect(r.necessary).toBe(true);
    expect(r.functional).toBe(true);
    const back = readConsent();
    expect(back?.functional).toBe(true);
    expect(back?.analytics).toBe(false);
  });

  it("ignores stored records with mismatched schema version", () => {
    localStorageMock.setItem(CONSENT_LS_KEY, JSON.stringify({ version: 99, functional: true }));
    expect(readConsent()).toBeNull();
  });

  it("clears the record", () => {
    writeConsent({ necessary: true, functional: true, analytics: true, marketing: true, gpcDetected: false });
    clearConsent();
    expect(readConsent()).toBeNull();
  });
});
