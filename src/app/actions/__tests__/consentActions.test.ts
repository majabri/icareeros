import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the recordConsent helper + next/headers. We're testing that the
// server action shapes its arguments correctly and forwards 3 records;
// the helper itself has its own tests in src/lib/consent/__tests__.
const recordSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/consent/record-consent", () => ({
  recordConsent: (records: unknown[]) => recordSpy(records),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => {
      if (key === "x-forwarded-for") return "10.20.30.40, 1.1.1.1";
      if (key === "user-agent") return "TestAgent/1.0";
      return null;
    },
  })),
}));

import { recordSignupConsent } from "../consentActions";

beforeEach(() => {
  recordSpy.mockClear();
});

describe("recordSignupConsent", () => {
  it("writes exactly 3 rows: privacy_terms, ai_processing, marketing_email", async () => {
    const res = await recordSignupConsent({
      userId: "user-1",
      email: "u@example.com",
      privacyTerms: true,
      aiProcessing: true,
      marketingEmail: false,
    });
    expect(res.ok).toBe(true);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    const records = recordSpy.mock.calls[0][0];
    expect(records).toHaveLength(3);
    expect(records.map((r: { consentType: string }) => r.consentType)).toEqual([
      "privacy_terms",
      "ai_processing",
      "marketing_email",
    ]);
  });

  it("forwards consented values per consent type", async () => {
    await recordSignupConsent({
      userId: "user-2",
      email: "u2@example.com",
      privacyTerms: true,
      aiProcessing: true,
      marketingEmail: true,
    });
    const records = recordSpy.mock.calls[0][0];
    expect(records[0].consented).toBe(true);   // privacy_terms
    expect(records[1].consented).toBe(true);   // ai_processing
    expect(records[2].consented).toBe(true);   // marketing_email
  });

  it("captures marketing=false when user declined optional checkbox", async () => {
    await recordSignupConsent({
      userId: "user-3",
      email: "u3@example.com",
      privacyTerms: true,
      aiProcessing: true,
      marketingEmail: false,
    });
    const records = recordSpy.mock.calls[0][0];
    expect(records[2].consentType).toBe("marketing_email");
    expect(records[2].consented).toBe(false);
  });

  it("extracts first IP from x-forwarded-for + passes user-agent", async () => {
    await recordSignupConsent({
      userId: "user-4",
      email: "u4@example.com",
      privacyTerms: true,
      aiProcessing: true,
      marketingEmail: false,
    });
    const records = recordSpy.mock.calls[0][0];
    for (const r of records) {
      expect(r.ipAddress).toBe("10.20.30.40");
      expect(r.userAgent).toBe("TestAgent/1.0");
    }
  });

  it("attaches userId + email to every row", async () => {
    await recordSignupConsent({
      userId: "user-5",
      email: "u5@example.com",
      privacyTerms: true,
      aiProcessing: true,
      marketingEmail: false,
    });
    const records = recordSpy.mock.calls[0][0];
    for (const r of records) {
      expect(r.userId).toBe("user-5");
      expect(r.email).toBe("u5@example.com");
    }
  });
});
