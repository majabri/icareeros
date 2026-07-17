/**
 * fix/jobs-enrichment-silent-complete — parity between the ROLE_FAMILIES
 * taxonomy in the two Deno edge functions:
 *
 *   supabase/functions/curate-user-recommendations/lib.ts  (source of truth)
 *   supabase/functions/enrich-jobs/index.ts                (inline mirror)
 *
 * The enricher writes role_families using its inline copy; the curator
 * reads them (and also uses its own copy for expandQueries). If the two
 * copies drift, enrichment classifies against one taxonomy and curation
 * expects another — the exact bug this PR fixes at a code level would
 * silently return.
 *
 * Same-shaped guard as the expandQueries.deno-parity test from PR #371.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function extractRoleFamilies(path: string): Record<string, string[]> {
  const src = readFileSync(resolve(path), "utf8");
  const start = src.indexOf("ROLE_FAMILIES: Record<string, string[]>");
  if (start < 0) throw new Error(`no ROLE_FAMILIES in ${path}`);
  const openBrace = src.indexOf("{", start);
  const closeBrace = src.indexOf("\n};\n", openBrace);
  const body = src.slice(openBrace + 1, closeBrace);

  const result: Record<string, string[]> = {};
  // Simple parser: find `familyName: [ "a", "b", ... ]`
  const re = /(\w+):\s*\[([\s\S]*?)\](?:,|\s*$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const family = m[1];
    const arr = m[2];
    const items: string[] = [];
    // Extract quoted strings
    const strRe = /"([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(arr)) !== null) items.push(sm[1]);
    result[family] = items;
  }
  return result;
}

describe("ROLE_FAMILIES parity — curator vs enricher", () => {
  const curator  = extractRoleFamilies("supabase/functions/curate-user-recommendations/lib.ts");
  const enricher = extractRoleFamilies("supabase/functions/enrich-jobs/index.ts");

  it("both files parse to non-empty taxonomies", () => {
    expect(Object.keys(curator).length).toBeGreaterThan(20);
    expect(Object.keys(enricher).length).toBeGreaterThan(20);
  });

  it("family keys identical between the two files", () => {
    expect(Object.keys(enricher).sort()).toEqual(Object.keys(curator).sort());
  });

  it("every family's synonym list is byte-identical between the two files", () => {
    for (const family of Object.keys(curator)) {
      expect(enricher[family], `family "${family}" differs`).toEqual(curator[family]);
    }
  });
});
