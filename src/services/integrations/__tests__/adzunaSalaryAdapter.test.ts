import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeRangeFromHistogram,
  fetchSalaryRange,
  normalizeTitle,
} from "../adzunaSalaryAdapter";

/**
 * Pure-function tests for the histogram math + title normalization
 * + a small fetch-mocking suite for the network layer.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("computeRangeFromHistogram", () => {
  it("returns no_data on empty histogram", () => {
    const r = computeRangeFromHistogram({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_data");
  });

  it("returns low_confidence when fewer than 5 samples total", () => {
    const r = computeRangeFromHistogram({ "100000": 2, "120000": 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("low_confidence");
  });

  it("returns p25/p75 for a realistic engineering distribution", () => {
    // 50 jobs spread across $80K–$220K with the bulk in the middle
    const r = computeRangeFromHistogram({
      "80000":  3,
      "100000": 8,
      "120000": 12,
      "140000": 14,
      "160000": 8,
      "180000": 3,
      "220000": 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sample_count).toBe(50);
    // p25 in this distribution should land around $120K, p75 around $160K
    expect(r.min).toBeGreaterThanOrEqual(100000);
    expect(r.min).toBeLessThanOrEqual(120000);
    expect(r.max).toBeGreaterThanOrEqual(140000);
    expect(r.max).toBeLessThanOrEqual(180000);
    expect(r.max).toBeGreaterThan(r.min);
  });

  it("nudges max up when min === max (single-bucket histogram)", () => {
    // 10 jobs all at $100K → both percentiles land at 100K
    const r = computeRangeFromHistogram({ "100000": 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.min).toBe(100000);
    expect(r.max).toBe(110000); // 10% nudge
  });

  it("ignores invalid keys / negative counts", () => {
    const r = computeRangeFromHistogram({
      "garbage":   100,
      "-5000":     5,
      "0":         5,
      "120000":   10,
      "130000":   10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sample_count).toBe(20);
  });
});

describe("normalizeTitle", () => {
  it("strips parenthesized qualifiers", () => {
    expect(normalizeTitle("Software Engineer (Remote)")).toBe("software engineer");
  });

  it("strips seniority + suffixes", () => {
    expect(normalizeTitle("Senior Software Engineer II")).toBe("software engineer");
    expect(normalizeTitle("Sr. Frontend Developer")).toBe("frontend developer");
    expect(normalizeTitle("Junior Data Analyst")).toBe("data analyst");
  });

  it("preserves tech tokens with #/+/.", () => {
    expect(normalizeTitle("C# / .NET Engineer")).toBe("c# / .net engineer");
    expect(normalizeTitle("C++ Developer")).toBe("c++ developer");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  Backend     Engineer\t\n")).toBe("backend engineer");
  });
});

describe("fetchSalaryRange — network layer", () => {
  it("returns config_missing when env vars are absent", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    const r = await fetchSalaryRange({ title: "Backend Engineer" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("config_missing");
  });

  it("hits the histogram endpoint with correct query params on happy path", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    globalThis.fetch = vi.fn(async (url) => {
      const u = new URL(String(url));
      expect(u.host).toBe("api.adzuna.com");
      expect(u.pathname).toBe("/v1/api/jobs/us/histogram");
      expect(u.searchParams.get("app_id")).toBe("app");
      expect(u.searchParams.get("app_key")).toBe("key");
      expect(u.searchParams.get("what")).toBe("backend engineer");
      expect(u.searchParams.get("location0")).toBe("New York, NY");
      return new Response(JSON.stringify({
        histogram: { "100000": 10, "120000": 15, "140000": 10, "160000": 5 },
      }), { status: 200, headers: { "content-type": "application/json" }});
    }) as unknown as typeof fetch;

    const r = await fetchSalaryRange({ title: "Backend Engineer", location: "New York, NY" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sample_count).toBe(40);
    expect(r.min).toBeGreaterThan(0);
    expect(r.max).toBeGreaterThan(r.min);
  });

  it("returns fetch_error on non-2xx", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    globalThis.fetch = vi.fn(async () =>
      new Response("rate limited", { status: 429 })
    ) as unknown as typeof fetch;

    const r = await fetchSalaryRange({ title: "Backend Engineer" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("fetch_error");
    expect(r.detail).toContain("HTTP 429");
  });

  it("returns no_data when histogram is empty", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ histogram: {} }), { status: 200 })
    ) as unknown as typeof fetch;

    const r = await fetchSalaryRange({ title: "Quantum Cobol Engineer" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_data");
  });

  it("survives malformed JSON gracefully", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "app");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    globalThis.fetch = vi.fn(async () =>
      new Response("not json", { status: 200 })
    ) as unknown as typeof fetch;

    const r = await fetchSalaryRange({ title: "Backend Engineer" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("fetch_error");
  });
});
