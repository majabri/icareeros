import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @supabase/ssr.createServerClient + next/headers.cookies BEFORE importing
// the helper so the helper picks up the mocks at module-load time.
const insertSpy = vi.fn().mockResolvedValue({ error: null });
const fromSpy = vi.fn(() => ({ insert: insertSpy }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ from: fromSpy })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => undefined,
  })),
}));

// Hashing requires the salt — set it for predictable tests.
process.env.CONSENT_IP_SALT = "test-salt";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

import { recordConsent } from "../record-consent";

beforeEach(() => {
  insertSpy.mockClear();
  fromSpy.mockClear();
});

describe("recordConsent", () => {
  it("does nothing when given an empty array", async () => {
    await recordConsent([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("maps cookie_all to kind='cookie' with all bools true", async () => {
    await recordConsent([
      { consentType: "cookie_all", consented: true, userId: "u1" },
    ]);
    expect(fromSpy).toHaveBeenCalledWith("consent_records");
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.kind).toBe("cookie");
    expect(row.necessary).toBe(true);
    expect(row.functional).toBe(true);
    expect(row.analytics).toBe(true);
    expect(row.marketing).toBe(true);
    expect(row.user_id).toBe("u1");
  });

  it("maps cookie_necessary to kind='cookie' with only necessary=true", async () => {
    await recordConsent([
      { consentType: "cookie_necessary", consented: true },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.kind).toBe("cookie");
    expect(row.necessary).toBe(true);
    expect(row.functional).toBe(false);
    expect(row.analytics).toBe(false);
    expect(row.marketing).toBe(false);
  });

  it("maps privacy_terms with all bools mirroring consented", async () => {
    await recordConsent([
      { consentType: "privacy_terms", consented: true },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.kind).toBe("privacy_terms");
    expect(row.necessary).toBe(true);
    expect(row.functional).toBe(true);
    expect(row.analytics).toBe(true);
    expect(row.marketing).toBe(true);
  });

  it("maps marketing_email consented=false to all bools false", async () => {
    await recordConsent([
      { consentType: "marketing_email", consented: false },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.kind).toBe("marketing_email");
    expect(row.necessary).toBe(false);
    expect(row.marketing).toBe(false);
  });

  it("hashes the IP with sha256+salt and never persists raw IP", async () => {
    await recordConsent([
      { consentType: "ai_processing", consented: true, ipAddress: "1.2.3.4" },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
  });

  it("truncates user_agent to 250 chars", async () => {
    const longUa = "x".repeat(500);
    await recordConsent([
      { consentType: "resume_upload", consented: true, userAgent: longUa },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row.user_agent.length).toBe(250);
  });

  it("does NOT persist the email field (existing schema lacks email column)", async () => {
    await recordConsent([
      { consentType: "founding_nonrefundable", consented: true, email: "u@example.com" },
    ]);
    const row = insertSpy.mock.calls[0][0][0];
    expect(row).not.toHaveProperty("email");
    expect(JSON.stringify(row)).not.toContain("u@example.com");
  });

  it("supports batch inserts (multiple records in one call)", async () => {
    await recordConsent([
      { consentType: "privacy_terms",   consented: true,  userId: "u1" },
      { consentType: "ai_processing",   consented: true,  userId: "u1" },
      { consentType: "marketing_email", consented: false, userId: "u1" },
    ]);
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(3);
    expect(rows[0].kind).toBe("privacy_terms");
    expect(rows[1].kind).toBe("ai_processing");
    expect(rows[2].kind).toBe("marketing_email");
    expect(rows[2].necessary).toBe(false);
  });

  it("never throws even when supabase insert errors", async () => {
    insertSpy.mockResolvedValueOnce({ error: { message: "boom" } });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      recordConsent([{ consentType: "privacy_terms", consented: true }]),
    ).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
