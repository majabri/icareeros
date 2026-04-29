/**
 * Unit tests for emailPreferenceService.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchEmailPreferences,
  updateEmailPreferences,
  DEFAULT_PREFERENCES,
} from "@/services/emailPreferenceService";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockReset());

const mockPrefs = {
  id: "pref-123",
  weekly_insights: true,
  job_alerts: false,
  marketing: false,
  unsubscribe_token: "token-abc",
  updated_at: "2026-04-29T00:00:00Z",
};

describe("DEFAULT_PREFERENCES", () => {
  it("has weekly_insights=true by default", () => {
    expect(DEFAULT_PREFERENCES.weekly_insights).toBe(true);
  });
  it("has job_alerts=true by default", () => {
    expect(DEFAULT_PREFERENCES.job_alerts).toBe(true);
  });
  it("has marketing=false by default", () => {
    expect(DEFAULT_PREFERENCES.marketing).toBe(false);
  });
});

describe("fetchEmailPreferences", () => {
  it("returns preferences when row exists", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPrefs }),
    });
    const result = await fetchEmailPreferences();
    expect(result).toEqual(mockPrefs);
    expect(result?.weekly_insights).toBe(true);
  });

  it("returns null when no row exists yet", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: null }),
    });
    const result = await fetchEmailPreferences();
    expect(result).toBeNull();
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Unauthorised",
      json: async () => ({ error: "Unauthorised" }),
    });
    await expect(fetchEmailPreferences()).rejects.toThrow("Unauthorised");
  });
});

describe("updateEmailPreferences", () => {
  it("sends PATCH and returns updated preferences", async () => {
    const updated = { ...mockPrefs, job_alerts: true };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: updated }),
    });
    const result = await updateEmailPreferences({ job_alerts: true });
    expect(result.job_alerts).toBe(true);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ job_alerts: true });
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Save failed" }),
    });
    await expect(updateEmailPreferences({ marketing: true })).rejects.toThrow("Save failed");
  });

  it("calls POST /api/email/preferences", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: mockPrefs }),
    });
    await updateEmailPreferences({ weekly_insights: false });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/email/preferences",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
