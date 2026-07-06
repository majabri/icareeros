/**
 * feat/jobs-ingest-workday-smartrecruiters — pure-function tests for the
 * edge-function logic. The full Deno serve() can't run under vitest, so
 * we port + test the URL builders + payload normalisers directly.
 */
import { describe, it, expect } from "vitest";

// ── Port of the Workday URL builders from the edge function ─────────────
function buildWorkdayUrl(tenant: string, shard: string, site: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
}
function workdayApplyUrl(tenant: string, shard: string, site: string, externalPath: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/${site}${externalPath}`;
}

// ── Port of the SR row shape mapper (parser) ────────────────────────────
interface SmartRecruitersPosting {
  id?: string; name?: string; applyUrl?: string; postingUrl?: string;
  location?: { city?: string; country?: string; remote?: boolean };
  releasedDate?: string; createdOn?: string;
}
function srPostingToRow(p: SmartRecruitersPosting, slug: string) {
  if (!p.id || !p.applyUrl) return null;
  return {
    source: "smartrecruiters",
    external_id: p.id,
    company: slug,
    title: (p.name || "").trim(),
    location: p.location?.city
      ? `${p.location.city}${p.location.country ? ", " + p.location.country : ""}`
      : null,
    apply_url: p.applyUrl ?? p.postingUrl,
    posted_at: p.releasedDate ?? p.createdOn ?? null,
    remote: !!p.location?.remote,
  };
}

// ── Port of the Workday row shape mapper ────────────────────────────────
interface WorkdayPosting {
  externalPath?: string; title?: string; locationsText?: string;
}
function wdPostingToRow(p: WorkdayPosting, tenant: string, shard: string, site: string) {
  if (!p.externalPath) return null;
  return {
    source: "workday",
    external_id: `${tenant}:${p.externalPath}`,
    company: tenant,
    title: (p.title || "").trim(),
    location: p.locationsText ?? null,
    apply_url: workdayApplyUrl(tenant, shard, site, p.externalPath),
    remote: /remote/i.test(p.locationsText ?? "") || /remote/i.test(p.title ?? ""),
  };
}

// ── Port of the ingest response shape ───────────────────────────────────
function buildResponse(sources: {
  greenhouse: { upserted: number; errors: string[] };
  lever: { upserted: number; errors: string[] };
  ashby: { upserted: number; errors: string[] };
  workday: { upserted: number; errors: string[] };
  smartrecruiters: { upserted: number; errors: string[] };
}, deactivated: number) {
  return {
    ok: true,
    ingested: sources.greenhouse.upserted + sources.lever.upserted + sources.ashby.upserted +
              sources.workday.upserted + sources.smartrecruiters.upserted,
    deactivated,
    greenhouse: { upserted: sources.greenhouse.upserted, errors: sources.greenhouse.errors.length },
    lever: { upserted: sources.lever.upserted, errors: sources.lever.errors.length },
    ashby: { upserted: sources.ashby.upserted, errors: sources.ashby.errors.length },
    workday: { upserted: sources.workday.upserted, errors: sources.workday.errors.length },
    smartrecruiters: { upserted: sources.smartrecruiters.upserted, errors: sources.smartrecruiters.errors.length },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Workday CXS URL construction", () => {
  it("builds the correct jobs endpoint URL", () => {
    expect(buildWorkdayUrl("cvshealth", "wd1", "CVS_Health_Careers"))
      .toBe("https://cvshealth.wd1.myworkdayjobs.com/wday/cxs/cvshealth/CVS_Health_Careers/jobs");
  });
  it("builds apply_url by appending externalPath under the site", () => {
    const url = workdayApplyUrl("kla", "wd1", "Search", "/en-US/Search/job/UsedRDResearchDevelopment");
    expect(url).toBe("https://kla.wd1.myworkdayjobs.com/Search/en-US/Search/job/UsedRDResearchDevelopment");
  });
  it("supports the wd103 + wd12 shards used by Deloitte and Capital One", () => {
    expect(buildWorkdayUrl("deloitte", "wd103", "Deloitte_External_Careers"))
      .toContain(".wd103.");
    expect(buildWorkdayUrl("capitalone", "wd12", "Capital_One"))
      .toContain(".wd12.");
  });
});

describe("Workday pagination — row shape", () => {
  it("maps a full jobPostings[] payload to ats_jobs shape", () => {
    const payload = {
      jobPostings: [
        { externalPath: "/en-US/careers/job/CISO", title: "Chief Information Security Officer", locationsText: "New York, NY" },
        { externalPath: "/en-US/careers/job/SWE", title: "Software Engineer", locationsText: "Remote (US)" },
        { title: "Missing path — filtered out" },
      ],
    };
    const rows = payload.jobPostings.map(p => wdPostingToRow(p, "acme", "wd5", "External")).filter(r => r);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "workday",
      external_id: "acme:/en-US/careers/job/CISO",
      company: "acme",
      title: "Chief Information Security Officer",
      apply_url: "https://acme.wd5.myworkdayjobs.com/External/en-US/careers/job/CISO",
      remote: false,
    });
    expect(rows[1]!.remote).toBe(true);
  });
  it("returns null for postings with no externalPath (filter-out signal)", () => {
    expect(wdPostingToRow({ title: "Ghost" }, "x", "wd1", "Y")).toBeNull();
  });
});

describe("SmartRecruiters posting detail normalisation", () => {
  it("normalises a full posting to ats_jobs shape", () => {
    const row = srPostingToRow({
      id: "abc-123",
      name: "Head of Engineering",
      applyUrl: "https://jobs.smartrecruiters.com/BoschGroup/abc-123",
      location: { city: "Stuttgart", country: "DE", remote: false },
      releasedDate: "2026-07-01T00:00:00Z",
    }, "BoschGroup");
    expect(row).toMatchObject({
      source: "smartrecruiters",
      external_id: "abc-123",
      company: "BoschGroup",
      title: "Head of Engineering",
      location: "Stuttgart, DE",
      apply_url: "https://jobs.smartrecruiters.com/BoschGroup/abc-123",
      remote: false,
    });
  });
  it("returns null when applyUrl is missing", () => {
    expect(srPostingToRow({ id: "no-url", name: "Job" }, "co")).toBeNull();
  });
  it("returns null when id is missing", () => {
    expect(srPostingToRow({ name: "Nameless", applyUrl: "https://x/1" }, "co")).toBeNull();
  });
  it("marks remote flag from location.remote", () => {
    const row = srPostingToRow({
      id: "1", name: "T", applyUrl: "https://x", location: { city: "NYC", remote: true },
    }, "co");
    expect(row?.remote).toBe(true);
  });
});

describe("Ingest response — partial failure shape", () => {
  it("includes upserted + errors count per source (Task 6)", () => {
    const body = buildResponse({
      greenhouse:      { upserted: 2718, errors: [] },
      lever:           { upserted: 114,  errors: [] },
      ashby:           { upserted: 470,  errors: [] },
      workday:         { upserted: 0,    errors: ["wd:kla:timeout", "wd:acme:502"] },
      smartrecruiters: { upserted: 342,  errors: ["sr:BoschGroup:429"] },
    }, 12);
    // Total is sum across all 5
    expect(body.ingested).toBe(2718 + 114 + 470 + 0 + 342);
    // Each source has its own count
    expect(body.workday.errors).toBe(2);
    expect(body.workday.upserted).toBe(0);
    expect(body.smartrecruiters.errors).toBe(1);
    expect(body.smartrecruiters.upserted).toBe(342);
  });
  it("still marks ok=true when one source failed entirely (Promise.allSettled)", () => {
    const body = buildResponse({
      greenhouse:      { upserted: 100, errors: [] },
      lever:           { upserted: 50,  errors: [] },
      ashby:           { upserted: 25,  errors: [] },
      workday:         { upserted: 0,   errors: ["wd:all:network"] },
      smartrecruiters: { upserted: 0,   errors: ["sr:all:429"] },
    }, 0);
    expect(body.ok).toBe(true);
    expect(body.ingested).toBe(175);
  });
});

describe("Ingest fan-out — response shape contract", () => {
  it("response contains all 5 source keys with { upserted, errors }", () => {
    const body = buildResponse({
      greenhouse:      { upserted: 1, errors: [] },
      lever:           { upserted: 1, errors: [] },
      ashby:           { upserted: 1, errors: [] },
      workday:         { upserted: 1, errors: [] },
      smartrecruiters: { upserted: 1, errors: [] },
    }, 0);
    for (const key of ["greenhouse","lever","ashby","workday","smartrecruiters"] as const) {
      expect(body[key]).toBeDefined();
      expect(typeof body[key].upserted).toBe("number");
      expect(typeof body[key].errors).toBe("number");
    }
  });
});
