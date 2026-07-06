/**
 * feat/jobs-expand-workday-smartrecruiters — company list integrity tests.
 * Prevents accidental deletions + shape drift after future expansions.
 */
import { describe, it, expect } from "vitest";
import {
  GREENHOUSE_COMPANIES,
  LEVER_COMPANIES,
  ASHBY_COMPANIES,
  WORKDAY_COMPANIES,
  SMARTRECRUITERS_COMPANIES,
  totalCuratedCompanies,
} from "../companyList";

describe("companyList — floor counts (regression guards)", () => {
  it("GREENHOUSE_COMPANIES has at least 50 verified entries", () => {
    expect(GREENHOUSE_COMPANIES.length).toBeGreaterThanOrEqual(50);
  });
  it("LEVER_COMPANIES has at least 15 verified entries", () => {
    expect(LEVER_COMPANIES.length).toBeGreaterThanOrEqual(15);
  });
  it("ASHBY_COMPANIES has at least 30 verified entries", () => {
    expect(ASHBY_COMPANIES.length).toBeGreaterThanOrEqual(30);
  });
  it("WORKDAY_COMPANIES has at least 15 verified entries", () => {
    expect(WORKDAY_COMPANIES.length).toBeGreaterThanOrEqual(15);
  });
  it("SMARTRECRUITERS_COMPANIES has at least 4 verified entries", () => {
    expect(SMARTRECRUITERS_COMPANIES.length).toBeGreaterThanOrEqual(4);
  });
  it("totalCuratedCompanies is at least 130", () => {
    expect(totalCuratedCompanies()).toBeGreaterThanOrEqual(130);
  });
});

describe("companyList — Workday shape consistency (Task 4)", () => {
  it("every Workday entry has shard + site + slug + name", () => {
    for (const c of WORKDAY_COMPANIES) {
      expect(c.name, `missing name on ${JSON.stringify(c)}`).toBeTruthy();
      expect(c.slug, `missing slug on ${c.name}`).toBeTruthy();
      expect(c.shard, `missing shard on ${c.name}`).toMatch(/^wd\d+$/);
      expect(c.site, `missing site on ${c.name}`).toBeTruthy();
    }
  });
});

describe("companyList — no duplicates within each adapter", () => {
  it("Greenhouse slugs are unique", () => {
    const slugs = GREENHOUSE_COMPANIES.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("Lever slugs are unique", () => {
    const slugs = LEVER_COMPANIES.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("Ashby slugs are unique", () => {
    const slugs = ASHBY_COMPANIES.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("Workday (tenant, shard, site) tuples are unique", () => {
    const keys = WORKDAY_COMPANIES.map(c => `${c.slug}|${c.shard}|${c.site}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("SmartRecruiters slugs are unique", () => {
    const slugs = SMARTRECRUITERS_COMPANIES.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
