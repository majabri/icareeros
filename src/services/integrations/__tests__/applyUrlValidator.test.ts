/**
 * fix/jobs-ux-feedback Fix 3 — tests for the apply-URL validator.
 */
import { describe, it, expect } from "vitest";
import { isValidApplyUrl } from "../applyUrlValidator";

describe("isValidApplyUrl", () => {
  it("accepts a specific Greenhouse posting URL", () => {
    expect(isValidApplyUrl("https://boards.greenhouse.io/stripe/jobs/6362946")).toBe(true);
  });
  it("accepts a specific Workday CXS URL", () => {
    expect(isValidApplyUrl("https://kla.wd1.myworkdayjobs.com/en-US/Search/details/Deputy-CISO_2636445")).toBe(true);
  });
  it("rejects a bare careers landing page", () => {
    expect(isValidApplyUrl("https://acme.com/careers")).toBe(false);
    expect(isValidApplyUrl("https://acme.com/careers/")).toBe(false);
  });
  it("rejects a bare /jobs listing page", () => {
    expect(isValidApplyUrl("https://acme.com/jobs")).toBe(false);
    expect(isValidApplyUrl("https://acme.com/jobs/")).toBe(false);
  });
  it("rejects a localised careers page", () => {
    expect(isValidApplyUrl("https://acme.com/en/careers")).toBe(false);
  });
  it("rejects a /job-search page", () => {
    expect(isValidApplyUrl("https://acme.com/careers/job-search")).toBe(false);
  });
  it("rejects URLs with fewer than 3 path segments", () => {
    expect(isValidApplyUrl("https://acme.com/jobs")).toBe(false);
    expect(isValidApplyUrl("https://acme.com/a/b")).toBe(false);
  });
  it("rejects null and empty strings without throwing", () => {
    expect(isValidApplyUrl(null)).toBe(false);
    expect(isValidApplyUrl("")).toBe(false);
    expect(isValidApplyUrl(undefined)).toBe(false);
  });
  it("rejects malformed URLs", () => {
    expect(isValidApplyUrl("not-a-url")).toBe(false);
  });
});
