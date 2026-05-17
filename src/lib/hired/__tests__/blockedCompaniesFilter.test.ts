import { describe, it, expect } from "vitest";
import {
  isBlockedFor,
  filterByBlockedCompanies,
} from "../blockedCompaniesFilter";

describe("isBlockedFor", () => {
  it("blocks when the viewer company is in the row's blocked_companies (case-insensitive)", () => {
    const row = { blocked_companies: ["Acme Corp", "Globex"] };
    expect(isBlockedFor(row, "Acme Corp")).toBe(true);
    expect(isBlockedFor(row, "acme corp")).toBe(true);
    expect(isBlockedFor(row, "ACME CORP")).toBe(true);
  });
  it("does NOT block when the company name is only a substring match", () => {
    const row = { blocked_companies: ["Acme"] };
    expect(isBlockedFor(row, "Acme Corporation")).toBe(false);
    expect(isBlockedFor(row, "Acme")).toBe(true);
  });
  it("returns false when blocked_companies is missing / null / non-array", () => {
    expect(isBlockedFor({}, "Acme")).toBe(false);
    expect(isBlockedFor({ blocked_companies: null }, "Acme")).toBe(false);
    expect(isBlockedFor({ blocked_companies: "Acme" }, "Acme")).toBe(false);
  });
  it("returns false when the viewer company is empty / whitespace", () => {
    const row = { blocked_companies: ["Acme"] };
    expect(isBlockedFor(row, "")).toBe(false);
    expect(isBlockedFor(row, "   ")).toBe(false);
  });
  it("ignores non-string entries inside blocked_companies", () => {
    const row = { blocked_companies: ["Acme", 42, null, "Globex"] as unknown[] };
    expect(isBlockedFor(row, "Globex")).toBe(true);
    expect(isBlockedFor(row, "42")).toBe(false);
  });
});

describe("filterByBlockedCompanies", () => {
  it("removes rows that block the viewer's company", () => {
    const rows = [
      { user_id: "a", blocked_companies: ["Acme Corp"] },
      { user_id: "b", blocked_companies: ["Globex"]   },
      { user_id: "c", blocked_companies: []           },
      { user_id: "d", blocked_companies: ["acme corp"] }, // case-insensitive
    ];
    const visible = filterByBlockedCompanies(rows, "Acme Corp");
    expect(visible.map((r) => r.user_id)).toEqual(["b", "c"]);
  });
  it("returns all rows when no viewer company is provided", () => {
    const rows = [
      { user_id: "a", blocked_companies: ["Acme"] },
      { user_id: "b", blocked_companies: ["Globex"] },
    ];
    expect(filterByBlockedCompanies(rows, "")).toHaveLength(2);
    expect(filterByBlockedCompanies(rows, "   ")).toHaveLength(2);
  });
  it("preserves rows even when their blocked_companies array is missing", () => {
    const rows = [
      { user_id: "a" },
      { user_id: "b", blocked_companies: ["Acme"] },
    ];
    const visible = filterByBlockedCompanies(rows, "Acme");
    expect(visible.map((r) => r.user_id)).toEqual(["a"]);
  });
});
