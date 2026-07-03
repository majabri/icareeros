/**
 * feat/jobs-url-validation — soft-404 detection tests. The regex list is
 * kept in-file with the edge function; this module mirrors the patterns
 * so we can test the classifier logic without invoking Deno.
 */
import { describe, it, expect } from "vitest";

const SOFT_404_PATTERNS: RegExp[] = [
  /\bjob (has been )?filled\b/i,
  /\bno longer (accepting|available|open)\b/i,
  /\bposition (has been )?closed\b/i,
  /\bposting (has )?expired\b/i,
  /\bthis (job|posting|role) is no longer\b/i,
  /\brequisition (closed|filled)\b/i,
];

function isSoft404(body: string): boolean {
  return SOFT_404_PATTERNS.some(p => p.test(body));
}

describe("soft-404 detection", () => {
  it("catches 'This job has been filled'", () => {
    expect(isSoft404("<html>This job has been filled</html>")).toBe(true);
  });
  it("catches 'no longer accepting applications'", () => {
    expect(isSoft404("Sorry, we are no longer accepting applications for this role.")).toBe(true);
  });
  it("catches 'position closed'", () => {
    expect(isSoft404("Position closed. Please browse other openings.")).toBe(true);
  });
  it("catches 'posting expired'", () => {
    expect(isSoft404("This posting has expired.")).toBe(true);
  });
  it("catches 'this role is no longer'", () => {
    expect(isSoft404("Unfortunately this role is no longer available.")).toBe(true);
  });
  it("returns false for a live job page body", () => {
    expect(isSoft404("Apply now for our Senior CISO opening. We offer competitive comp.")).toBe(false);
  });
  it("catches 'requisition closed'", () => {
    expect(isSoft404("This requisition closed on 2026-05-01.")).toBe(true);
  });
});
