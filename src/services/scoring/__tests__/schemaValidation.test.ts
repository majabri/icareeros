/**
 * fix/jobs-opportunity-quality-p0 — regression tests catching queries
 * against the wrong table.
 *
 * target_roles lives on public.user_profiles, NOT public.career_profiles.
 * Prior code queried career_profiles → Supabase returned a
 * "column does not exist" error → try/catch swallowed → auto-search and
 * profile scoring silently degraded. This test suite makes that class of
 * table-name drift loud.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

describe("schema — target_roles must be queried from user_profiles, not career_profiles", () => {
  const filesThatQueryTargetRoles = [
    "src/services/scoring/profileExtractor.ts",
    "src/services/integrations/opportunityAggregator.ts",
    "src/app/(app)/opportunities/page.tsx",
  ];

  for (const file of filesThatQueryTargetRoles) {
    it(`${file} does not select target_roles from career_profiles`, () => {
      const src = read(file);
      // Precise scan: for each `.from("career_profiles")` call, walk
      // forward to the FIRST `.select(...)` in the same chain (before any
      // other `.from(...)` starts) and assert the select's arg does not
      // contain "target_roles".
      const cpRe = /\.from\(\s*["']career_profiles["']\s*\)/g;
      const findSelectArg = (from: number): string | null => {
        // Look ahead up to 500 chars for a `.select("...")` that comes
        // before any other `.from(...)`.
        const window = src.slice(from, from + 500);
        const nextFrom = window.slice(1).indexOf(".from(");
        const scope = nextFrom === -1 ? window : window.slice(0, nextFrom + 1);
        const m = scope.match(/\.select\(\s*["']([^"']+)["']/);
        return m ? m[1] : null;
      };
      let match;
      while ((match = cpRe.exec(src)) !== null) {
        const arg = findSelectArg(match.index);
        if (arg && /target_roles/.test(arg)) {
          throw new Error(`${file}: .from("career_profiles").select("${arg}") queries target_roles — that column lives on user_profiles`);
        }
      }
    });
  }

  it("target_roles is exclusively typed on user_profiles in src/types/database.ts", () => {
    const src = read("src/types/database.ts");
    // Count occurrences of target_roles across the whole file — we expect
    // 3 (Row / Insert / Update on user_profiles).
    const hits = src.match(/target_roles/g) ?? [];
    expect(hits.length).toBe(3);
    // And their nearest ancestor "TABLE_NAME: {" should be user_profiles.
    // Simplest check: they must NOT appear in the career_profiles block.
    const cpStart = src.indexOf("career_profiles: {");
    if (cpStart >= 0) {
      // Find the matching closing "}" at the same brace depth as the block
      // (naive but adequate for this test — assumes types file is one
      // level of nesting per table).
      const cpBlockEnd = src.indexOf("\n      }", cpStart);
      const cpBlock = cpBlockEnd > cpStart ? src.slice(cpStart, cpBlockEnd) : "";
      expect(cpBlock).not.toContain("target_roles");
    }
  });
});
