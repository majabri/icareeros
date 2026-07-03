/**
 * feat/jobs-serve-from-cache — tier grouping + explanation tests.
 * Mirrors the logic in route.ts so we can exercise it without booting Next.
 */
import { describe, it, expect } from "vitest";

interface CachedRow {
  fit_score: number;
  tier: "strongMatch" | "worthConsidering" | "stretch";
  match_reason: string | null;
  computed_at: string;
  job: { id: string; title: string; company: string; apply_url: string; direct_apply_url: string | null } | null;
}

function tierExplanation(tier: "strongMatch" | "worthConsidering" | "stretch", n: number) {
  if (n === 0) return "";
  if (tier === "strongMatch") return `${n} ${n === 1 ? "role" : "roles"} closely aligned with your target role.`;
  if (tier === "worthConsidering") return `${n} adjacent ${n === 1 ? "opportunity" : "opportunities"} worth exploring.`;
  return `${n} stretch ${n === 1 ? "opportunity" : "opportunities"} that push toward more senior or specialised roles.`;
}

function groupByTier(rows: CachedRow[]) {
  const strong: unknown[] = [], worth: unknown[] = [], stretch: unknown[] = [];
  let latest = "";
  for (const r of rows) {
    if (!r.job) continue;
    const opp = { url: r.job.direct_apply_url ?? r.job.apply_url, title: r.job.title, fit_score: r.fit_score };
    if (r.tier === "strongMatch") strong.push(opp);
    else if (r.tier === "worthConsidering") worth.push(opp);
    else stretch.push(opp);
    if (r.computed_at > latest) latest = r.computed_at;
  }
  return { strong, worth, stretch, latest };
}

describe("cache serve — tier grouping", () => {
  it("groups by tier and picks latest computed_at", () => {
    const rows: CachedRow[] = [
      { fit_score: 80, tier: "strongMatch", match_reason: "x", computed_at: "2026-07-04T04:00:00Z", job: { id: "1", title: "CISO", company: "A", apply_url: "u1", direct_apply_url: null } },
      { fit_score: 50, tier: "worthConsidering", match_reason: "y", computed_at: "2026-07-04T04:00:01Z", job: { id: "2", title: "VP Sec", company: "B", apply_url: "u2", direct_apply_url: "d2" } },
      { fit_score: 32, tier: "stretch", match_reason: "z", computed_at: "2026-07-04T03:59:00Z", job: { id: "3", title: "Sec Lead", company: "C", apply_url: "u3", direct_apply_url: null } },
    ];
    const g = groupByTier(rows);
    expect(g.strong).toHaveLength(1);
    expect(g.worth).toHaveLength(1);
    expect(g.stretch).toHaveLength(1);
    expect(g.latest).toBe("2026-07-04T04:00:01Z");
  });
  it("prefers direct_apply_url over apply_url", () => {
    const g = groupByTier([{ fit_score: 90, tier: "strongMatch", match_reason: null, computed_at: "2026-07-04T04:00:00Z", job: { id: "1", title: "T", company: "C", apply_url: "raw", direct_apply_url: "direct" } }]);
    expect((g.strong[0] as { url: string }).url).toBe("direct");
  });
  it("falls back to apply_url when direct_apply_url is null", () => {
    const g = groupByTier([{ fit_score: 50, tier: "worthConsidering", match_reason: null, computed_at: "2026-07-04T04:00:00Z", job: { id: "1", title: "T", company: "C", apply_url: "raw", direct_apply_url: null } }]);
    expect((g.worth[0] as { url: string }).url).toBe("raw");
  });
  it("skips rows with null job", () => {
    const g = groupByTier([{ fit_score: 50, tier: "stretch", match_reason: null, computed_at: "2026-07-04T04:00:00Z", job: null }]);
    expect(g.strong).toEqual([]); expect(g.worth).toEqual([]); expect(g.stretch).toEqual([]);
  });
});

describe("cache serve — tier explanations", () => {
  it("empty tier returns empty string", () => {
    expect(tierExplanation("strongMatch", 0)).toBe("");
  });
  it("strongMatch singular vs plural", () => {
    expect(tierExplanation("strongMatch", 1)).toContain("1 role closely aligned");
    expect(tierExplanation("strongMatch", 5)).toContain("5 roles closely aligned");
  });
  it("worthConsidering copy", () => {
    expect(tierExplanation("worthConsidering", 3)).toContain("adjacent opportunities worth exploring");
  });
});
