/**
 * applyHelpers tests — resolveApplyTarget routing logic.
 *
 * autoSaveApplication is fetch-side-effecty and is exercised
 * end-to-end in the Wave 3.5 CHECKPOINT verification (Chrome MCP).
 */
import { describe, it, expect } from "vitest";
import { resolveApplyTarget } from "../applyHelpers";

describe("resolveApplyTarget", () => {
  it("returns direct mode when apply_url_company is set", () => {
    const r = resolveApplyTarget({
      apply_url_company: "https://boards.greenhouse.io/stripe/jobs/12345",
      title: "Software Engineer",
      company: "Stripe",
    });
    expect(r.mode).toBe("direct");
    expect(r.pipelineStatus).toBe("applying");
    expect(r.url).toContain("greenhouse.io/stripe");
    expect(r.label).toBe("✈ Apply at Stripe →");
    expect(r.hostname).toBe("boards.greenhouse.io");
  });

  it("falls back to Google research mode when no chased URL", () => {
    const r = resolveApplyTarget({
      apply_url_company: null,
      title: "Senior Backend Engineer",
      company: "Notion",
    });
    expect(r.mode).toBe("research");
    expect(r.pipelineStatus).toBe("researching");
    expect(r.url).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
    expect(decodeURIComponent(r.url)).toContain("Senior Backend Engineer Notion careers apply");
    expect(r.label).toBe("🔎 Find & Apply →");
    expect(r.hostname).toBe("google.com");
  });

  it("treats empty company string gracefully", () => {
    const r = resolveApplyTarget({
      apply_url_company: null,
      title: "Designer",
      company: "",
    });
    expect(r.mode).toBe("research");
    expect(r.label).toContain("Find");
  });

  it("returns a label that NEVER contains 'unavailable' or 'disabled'", () => {
    // Hard rule from the brief: Apply button is never disabled.
    const noUrl  = resolveApplyTarget({ apply_url_company: null, title: "PM", company: "X" });
    const yesUrl = resolveApplyTarget({ apply_url_company: "https://example.com/jobs/1", title: "PM", company: "X" });
    expect(noUrl.label.toLowerCase()).not.toMatch(/unavailable|disabled/);
    expect(yesUrl.label.toLowerCase()).not.toMatch(/unavailable|disabled/);
  });

  it("hostname strips the leading www.", () => {
    const r = resolveApplyTarget({
      apply_url_company: "https://www.linear.app/careers/role-1",
      title: "PM",
      company: "Linear",
    });
    expect(r.hostname).toBe("linear.app");
  });
});
