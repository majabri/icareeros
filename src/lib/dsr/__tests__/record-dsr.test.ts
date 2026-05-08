import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @supabase/supabase-js.createClient — record what insert() receives.
const insertSpy = vi.fn().mockResolvedValue({ error: null });
const fromSpy = vi.fn(() => ({ insert: insertSpy }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy })),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

import { recordDSRRequest } from "../record-dsr";

beforeEach(() => {
  insertSpy.mockClear();
  fromSpy.mockClear();
});

describe("recordDSRRequest", () => {
  it("inserts an 'access' request with status defaulted to 'received'", async () => {
    await recordDSRRequest({
      userId: "u1",
      email: "u1@example.com",
      requestType: "access",
    });
    expect(fromSpy).toHaveBeenCalledWith("dsr_requests");
    const row = insertSpy.mock.calls[0][0];
    expect(row.user_id).toBe("u1");
    expect(row.email).toBe("u1@example.com");
    expect(row.request_type).toBe("access");
    expect(row.status).toBe("received");
    expect(row.completed_at).toBeNull();
  });

  it("sets completed_at when completedNow is true and status is 'completed'", async () => {
    await recordDSRRequest({
      userId: "u2",
      email: "u2@example.com",
      requestType: "deletion",
      status: "completed",
      completedNow: true,
    });
    const row = insertSpy.mock.calls[0][0];
    expect(row.status).toBe("completed");
    expect(row.completed_at).not.toBeNull();
    expect(typeof row.completed_at).toBe("string");
    // ISO format check
    expect(row.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("default due_by is +30 days for deletion, +45 days for everything else", async () => {
    const now = Date.now();

    await recordDSRRequest({
      userId: "u3",
      email: "u3@example.com",
      requestType: "deletion",
    });
    const deletionRow = insertSpy.mock.calls[0][0];
    const deletionDelta = new Date(deletionRow.due_by).getTime() - now;
    // Expect ~30 days; tolerate ±2 minutes for test execution skew.
    expect(deletionDelta).toBeGreaterThan(30 * 24 * 60 * 60 * 1000 - 120_000);
    expect(deletionDelta).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 120_000);

    insertSpy.mockClear();
    await recordDSRRequest({
      userId: "u4",
      email: "u4@example.com",
      requestType: "access",
    });
    const accessRow = insertSpy.mock.calls[0][0];
    const accessDelta = new Date(accessRow.due_by).getTime() - now;
    expect(accessDelta).toBeGreaterThan(45 * 24 * 60 * 60 * 1000 - 120_000);
    expect(accessDelta).toBeLessThan(45 * 24 * 60 * 60 * 1000 + 120_000);
  });

  it("dueByDays override wins over the request-type default", async () => {
    const before = Date.now();
    await recordDSRRequest({
      userId: "u5",
      email: "u5@example.com",
      requestType: "access",
      dueByDays: 7,
    });
    const row = insertSpy.mock.calls[0][0];
    const delta = new Date(row.due_by).getTime() - before;
    expect(delta).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 120_000);
    expect(delta).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 120_000);
  });

  it("forwards optional jurisdiction + notes", async () => {
    await recordDSRRequest({
      userId: "u6",
      email: "u6@example.com",
      requestType: "deletion",
      jurisdiction: "CA",
      notes: "Self-service via API",
    });
    const row = insertSpy.mock.calls[0][0];
    expect(row.jurisdiction).toBe("CA");
    expect(row.notes).toBe("Self-service via API");
  });

  it("never throws when supabase insert errors", async () => {
    insertSpy.mockResolvedValueOnce({ error: { message: "boom" } });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      recordDSRRequest({
        userId: "u7",
        email: "u7@example.com",
        requestType: "access",
      }),
    ).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
