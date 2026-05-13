import { describe, it, expect } from "vitest";
import { toDiscoveredJob, verifyPerplexityRow, DISCOVERY_CATEGORIES } from "../perplexityAdapter";

describe("perplexity helpers", () => {
  it("DISCOVERY_CATEGORIES has 5 entries", () => {
    expect(DISCOVERY_CATEGORIES.length).toBe(5);
  });

  it("toDiscoveredJob normalizes the row shape", () => {
    const j = toDiscoveredJob({
      company: "Acme",
      role: "Senior Engineer",
      url: "https://boards.greenhouse.io/acme/jobs/123?utm_source=foo",
    });
    expect(j.source).toBe("perplexity");
    expect(j.source_type).toBe("llm_discovery");
    expect(j.title).toBe("Senior Engineer");
    expect(j.company).toBe("Acme");
    expect(j.raw_url_hash).toMatch(/^[0-9a-f]{64}$/);
    // canonical strips utm
    expect(j.canonical_url).toBe("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("verifyPerplexityRow rejects blocked domains without making any network call", async () => {
    const r = await verifyPerplexityRow(
      { company: "Acme", role: "Eng", url: "https://example.spam.xyz/jobs/1" },
      new Set(),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("domain_blocked");
  });

  it("verifyPerplexityRow rejects duplicates", async () => {
    const url = "https://boards.greenhouse.io/acme/jobs/123";
    // pre-seed the hash for this URL
    const seed = new Set<string>();
    // We'll cheat: we know toDiscoveredJob computes the hash. Mimic it.
    const j = toDiscoveredJob({ company: "A", role: "E", url });
    seed.add(j.raw_url_hash);
    const r = await verifyPerplexityRow({ company: "A", role: "E", url }, seed);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("duplicate");
  });
});
