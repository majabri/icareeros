import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchAlertSubscription,
  saveAlertSubscription,
  deleteAlertSubscription,
} from "../jobAlertService";

const mockSub = {
  id: "sub-1",
  query: "product manager",
  is_remote: true,
  job_type: "Full-time",
  frequency: "daily" as const,
  is_active: true,
  last_sent_at: null,
  created_at: "2026-04-29T00:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

// ── fetchAlertSubscription ────────────────────────────────────────────────────

describe("fetchAlertSubscription", () => {
  it("returns null when no subscription exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subscription: null }),
    }));
    const result = await fetchAlertSubscription();
    expect(result).toBeNull();
  });

  it("returns the subscription when one exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subscription: mockSub }),
    }));
    const result = await fetchAlertSubscription();
    expect(result).toMatchObject({ id: "sub-1", query: "product manager" });
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    }));
    await expect(fetchAlertSubscription()).rejects.toThrow("Unauthorized");
  });
});

// ── saveAlertSubscription ─────────────────────────────────────────────────────

describe("saveAlertSubscription", () => {
  it("POSTs correct body and returns saved subscription", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subscription: mockSub }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await saveAlertSubscription({
      query: "product manager",
      is_remote: true,
      job_type: "Full-time",
      frequency: "daily",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/job-alerts",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toMatchObject({ id: "sub-1", frequency: "daily" });
  });

  it("throws on error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Failed to save subscription" }),
    }));
    await expect(saveAlertSubscription({})).rejects.toThrow("Failed to save subscription");
  });
});

// ── deleteAlertSubscription ───────────────────────────────────────────────────

describe("deleteAlertSubscription", () => {
  it("sends DELETE request and resolves on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(deleteAlertSubscription()).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith("/api/job-alerts", { method: "DELETE" });
  });

  it("throws on error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Failed to delete alert subscription" }),
    }));
    await expect(deleteAlertSubscription()).rejects.toThrow("Failed to delete alert subscription");
  });
});
