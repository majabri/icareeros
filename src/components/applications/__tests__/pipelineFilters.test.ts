/**
 * pipelineFilters — pure-function unit tests for the Applications pipeline.
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

import { describe, it, expect } from "vitest";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  isApplicationStatus,
  filterApplications,
  sortApplications,
  countApplications,
  type Application,
} from "../pipelineFilters";

function makeRow(over: Partial<Application> = {}): Application {
  return {
    id:             over.id           ?? "row-1",
    user_id:        over.user_id      ?? "u1",
    cycle_id:       over.cycle_id     ?? null,
    opportunity_id: over.opportunity_id ?? null,
    job_title:      over.job_title    ?? "PM",
    company:        over.company      ?? "Acme",
    job_url:        over.job_url      ?? null,
    status:         over.status       ?? "applied",
    notes:          over.notes        ?? null,
    applied_at:    over.applied_at   ?? "2026-05-01T00:00:00Z",
    updated_at:    over.updated_at   ?? "2026-05-01T00:00:00Z",
  };
}

describe("STATUS_ORDER + STATUS_LABEL", () => {
  it("has the five expected statuses in order", () => {
    expect(STATUS_ORDER).toEqual(["applied", "interviewing", "offer", "rejected", "withdrawn"]);
  });
  it("every status has a label", () => {
    for (const s of STATUS_ORDER) {
      expect(typeof STATUS_LABEL[s]).toBe("string");
      expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
    }
  });
});

describe("isApplicationStatus", () => {
  it("accepts known statuses", () => {
    for (const s of STATUS_ORDER) expect(isApplicationStatus(s)).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isApplicationStatus("pending")).toBe(false);
    expect(isApplicationStatus("")).toBe(false);
    expect(isApplicationStatus(null)).toBe(false);
    expect(isApplicationStatus(undefined)).toBe(false);
    expect(isApplicationStatus(42)).toBe(false);
  });
});

describe("filterApplications", () => {
  const rows = [
    makeRow({ id: "1", status: "applied",      job_title: "Senior PM", company: "Acme" }),
    makeRow({ id: "2", status: "interviewing", job_title: "Designer",  company: "Beta Corp" }),
    makeRow({ id: "3", status: "offer",        job_title: "PM",        company: "Gamma" }),
    makeRow({ id: "4", status: "rejected",     job_title: "EM",        company: "Delta Co" }),
  ];

  it("status='all' returns everything", () => {
    expect(filterApplications(rows, { status: "all" })).toHaveLength(4);
  });

  it("status filter narrows to one bucket", () => {
    const out = filterApplications(rows, { status: "interviewing" });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("2");
  });

  it("query is case-insensitive substring on title/company", () => {
    expect(filterApplications(rows, { query: "acme" }).map(r => r.id)).toEqual(["1"]);
    expect(filterApplications(rows, { query: "PM"   }).map(r => r.id)).toEqual(["1", "3"]);
    expect(filterApplications(rows, { query: "Co"   }).map(r => r.id)).toEqual(["2", "4"]);
  });

  it("status + query compose", () => {
    const out = filterApplications(rows, { status: "applied", query: "senior" });
    expect(out.map(r => r.id)).toEqual(["1"]);
  });

  it("missing filter returns the array unchanged (defensive copy)", () => {
    const out = filterApplications(rows, {});
    expect(out).toHaveLength(4);
    expect(out).not.toBe(rows); // new array
  });
});

describe("sortApplications", () => {
  const rows = [
    makeRow({ id: "old",  applied_at: "2026-01-01T00:00:00Z", status: "rejected" }),
    makeRow({ id: "new",  applied_at: "2026-04-01T00:00:00Z", status: "applied"  }),
    makeRow({ id: "mid",  applied_at: "2026-02-01T00:00:00Z", status: "offer"    }),
  ];

  it("applied_at_desc puts newest first (default)", () => {
    expect(sortApplications(rows, "applied_at_desc").map(r => r.id))
      .toEqual(["new", "mid", "old"]);
  });

  it("applied_at_asc puts oldest first", () => {
    expect(sortApplications(rows, "applied_at_asc").map(r => r.id))
      .toEqual(["old", "mid", "new"]);
  });

  it("status_asc orders by STATUS_ORDER then by applied_at_desc", () => {
    const out = sortApplications(rows, "status_asc").map(r => r.id);
    // applied (new) > interviewing (n/a) > offer (mid) > rejected (old) > withdrawn
    expect(out).toEqual(["new", "mid", "old"]);
  });

  it("returns a new array — does not mutate input", () => {
    const before = rows.slice();
    sortApplications(rows, "applied_at_desc");
    expect(rows).toEqual(before);
  });
});

describe("countApplications", () => {
  const rows = [
    makeRow({ id: "1", status: "applied" }),
    makeRow({ id: "2", status: "applied" }),
    makeRow({ id: "3", status: "interviewing" }),
    makeRow({ id: "4", status: "offer" }),
    makeRow({ id: "5", status: "rejected" }),
    makeRow({ id: "6", status: "withdrawn" }),
  ];
  it("counts each bucket and total", () => {
    const c = countApplications(rows);
    expect(c).toEqual({
      total: 6, applied: 2, interviewing: 1, offer: 1, rejected: 1, withdrawn: 1,
      active: 4, // applied(2) + interviewing(1) + offer(1)
    });
  });
  it("empty → all zeros", () => {
    expect(countApplications([])).toEqual({
      total: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0, withdrawn: 0,
      active: 0,
    });
  });
});
