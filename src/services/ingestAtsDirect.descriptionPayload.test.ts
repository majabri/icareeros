import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ingestSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/ingest-ats-direct/index.ts"),
  "utf8",
);

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = ingestSource.indexOf(startMarker);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThan(-1);

  const from = start + startMarker.length;
  const end = ingestSource.indexOf(endMarker, from);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(from);

  return ingestSource.slice(from, end);
}

function adapterPayloadBlock(source: "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters"): string {
  switch (source) {
    case "greenhouse":
      return sliceBetween('source: "greenhouse",', "\n      }));");
    case "lever":
      return sliceBetween('source: "lever",', "\n      }));");
    case "ashby":
      return sliceBetween('source: "ashby",', "\n      }));");
    case "workday":
      return sliceBetween('source: "workday",', "\n      };");
    case "smartrecruiters":
      return sliceBetween('source: "smartrecruiters",', "\n        };");
  }
}

function stripHtml(s: string): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function workdayApplyUrl(tenant: string, shard: string, site: string, externalPath: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/${site}${externalPath}`;
}

function buildGreenhousePayload(j: any, slug: string) {
  const body = adapterPayloadBlock("greenhouse");
  return new Function("j", "slug", "stripHtml", `return ({ source: "greenhouse",${body} });`)(
    j,
    slug,
    stripHtml,
  );
}

function buildWorkdayPayload(p: any, tenant = "acme", shard = "wd1", site = "External") {
  const body = adapterPayloadBlock("workday");
  return new Function(
    "p",
    "t",
    "workdayApplyUrl",
    `const externalPath = p.externalPath ?? ""; return ({ source: "workday",${body} });`,
  )(
    p,
    { tenant, shard, site },
    workdayApplyUrl,
  );
}

function applyConflictUpdate(existingRow: Record<string, unknown>, payload: Record<string, unknown>) {
  return { ...existingRow, ...payload };
}

describe("ingest-ats-direct payload shape — description key ownership", () => {
  it("omits description from greenhouse payload entirely", () => {
    expect(adapterPayloadBlock("greenhouse")).not.toMatch(/\bdescription\s*:/);
  });

  it("omits description from workday payload entirely", () => {
    expect(adapterPayloadBlock("workday")).not.toMatch(/\bdescription\s*:/);
  });

  it("keeps description in ashby payload", () => {
    expect(adapterPayloadBlock("ashby")).toMatch(/\bdescription\s*:/);
  });

  it("keeps description in lever payload", () => {
    expect(adapterPayloadBlock("lever")).toMatch(/\bdescription\s*:/);
  });

  it("keeps description in smartrecruiters payload", () => {
    expect(adapterPayloadBlock("smartrecruiters")).toMatch(/\bdescription\s*:/);
  });
});

describe("ingest-ats-direct re-orphan regression — conflict update preserves description", () => {
  it("greenhouse conflict update leaves an existing description untouched", () => {
    const existingRow = {
      source: "greenhouse",
      apply_url: "https://boards.greenhouse.io/acme/jobs/123",
      description: "Existing non-empty description",
    };
    const payload = buildGreenhousePayload({
      id: 123,
      title: "Security Engineer",
      absolute_url: existingRow.apply_url,
      location: { name: "Remote" },
      content: "",
      updated_at: "2026-08-27T00:00:00.000Z",
    }, "acme");

    expect(payload).not.toHaveProperty("description");
    expect(applyConflictUpdate(existingRow, payload).description).toBe(existingRow.description);
  });

  it("workday conflict update leaves an existing description untouched", () => {
    const existingRow = {
      source: "workday",
      apply_url: "https://acme.wd1.myworkdayjobs.com/External/en-US/careers/job/123",
      description: "Existing non-empty description",
    };
    const payload = buildWorkdayPayload({
      externalPath: "/en-US/careers/job/123",
      title: "Platform Engineer",
      locationsText: "Remote (US)",
    });

    expect(payload).not.toHaveProperty("description");
    expect(applyConflictUpdate(existingRow, payload).description).toBe(existingRow.description);
  });
});
