/**
 * ADR-0006 byte-identity test — the centerpiece per Amir 2026-07-23.
 *
 * The F4 formula ships in TWO places:
 *   - Node — src/services/scoring/f4Denominator.ts (this file's import)
 *   - Deno — supabase/functions/_shared/scoring/f4Denominator.ts
 *
 * Both files must be byte-identical (drift check in this suite), and both
 * scorers must produce byte-identical output on the same inputs.
 *
 * Fixture set covers the divergence case from ADR-0006 §1.2 (low-profile
 * user × skill-heavy JD, where F1 pre-alignment differed dramatically
 * between Node's `max(profile, jd, 1)` and Deno's `profile.length`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  f4Denominator,
  f4SkillsScore,
  F4_FLOOR,
} from "../f4Denominator";
import { extractJDSkills as extractNode } from "../jdExtractor";
// The Deno vendored copy is byte-identical TS with no Deno-specific APIs,
// so vitest can load it directly for the byte-identity assertion.
import { extractJDSkills as extractDeno } from "../../../../supabase/functions/_shared/scoring/jdExtractor";
import {
  f4SkillsScore as denoF4,
  f4Denominator as denoF4Denom,
  F4_FLOOR as DENO_F4_FLOOR,
} from "../../../../supabase/functions/_shared/scoring/f4Denominator";

// ── drift guard — the two copies must be byte-identical ──

describe("F4 — copy drift guard", () => {
  const copies = [
    ["src/services/scoring/f4Denominator.ts",
     "supabase/functions/_shared/scoring/f4Denominator.ts"],
    ["src/services/scoring/jdExtractor.ts",
     "supabase/functions/_shared/scoring/jdExtractor.ts"],
    ["src/services/scoring/skillsNormalizer.ts",
     "supabase/functions/_shared/scoring/skillsNormalizer.ts"],
    ["src/services/scoring/geoTokens.ts",
     "supabase/functions/_shared/scoring/geoTokens.ts"],
  ];
  for (const [nodePath, denoPath] of copies) {
    it(`Node ${nodePath} and Deno ${denoPath} are byte-identical`, () => {
      const nodeBytes = readFileSync(resolve(process.cwd(), nodePath));
      const denoBytes = readFileSync(resolve(process.cwd(), denoPath));
      expect(nodeBytes.equals(denoBytes)).toBe(true);
    });
  }
});

describe("F4 — formula constants", () => {
  it("F4_FLOOR is 10 on both sides", () => {
    expect(F4_FLOOR).toBe(10);
    expect(DENO_F4_FLOOR).toBe(10);
  });
});

describe("F4 — f4Denominator table", () => {
  const cases: Array<[number, number, number]> = [
    // [profile, jd, expected_denom]
    [0,  0,  10],  // both empty → floor
    [0,  5,  10],  // one empty → floor
    [5,  0,  10],  // other empty → floor
    [5,  5,  10],  // both below floor → floor
    [10, 10, 10],  // both at floor exactly → floor
    [11, 15, 11],  // min = 11 (above floor)
    [15, 11, 11],  // symmetric
    [33, 13, 13],  // Cohere case — min(33, 13) = 13
    [33, 25, 25],  // rich profile × cap-saturating JD → min = 25
    [5,  25, 10],  // small profile × big JD (F2 inflation guard fires)
    [100, 100, 100],
  ];
  for (const [p, j, expected] of cases) {
    it(`f4Denominator(${p}, ${j}) === ${expected}`, () => {
      expect(f4Denominator(p, j)).toBe(expected);
      expect(denoF4Denom(p, j)).toBe(expected);  // Deno matches
    });
  }
});

describe("F4 — f4SkillsScore table", () => {
  const cases: Array<[number, number, number, number]> = [
    // [matched, profile, jd, expected_score]
    [0, 33, 13, 0],
    [3, 33, 13, 23],  // live Cohere baseline (2026-07-23 capture)
    [4, 33, 13, 31],  // §3.3 subagent Profile A
    [6, 33, 13, 46],  // hypothetical cleaner extraction
    [8, 33, 13, 62],  // composite ~79 requires this
    [3, 5,  25, 30],  // small-profile inflation guard: matched/floor=3/10=30
    [1, 5,  25, 10],  // single hit on small profile → 10 (was 20 under raw F2)
    [10, 15, 25, 67], // mid profile × big JD → matched/15 ≈ 67
    [10, 15, 15, 67],
  ];
  for (const [m, p, j, expected] of cases) {
    it(`f4SkillsScore(matched=${m}, profile=${p}, jd=${j}) === ${expected}`, () => {
      expect(f4SkillsScore(m, p, j)).toBe(expected);
      expect(denoF4(m, p, j)).toBe(expected);  // Deno matches
    });
  }
});

// ── The centerpiece — end-to-end byte-identity ──

describe("F4 — end-to-end byte-identity: same profile × same JD through both scorers", () => {
  const jdCohere = `Who are we? Cohere is the leading security-first enterprise AI company.

The Opportunity
Cohere seeks a Chief Information Security Officer.

Requirements
- CISO track record
- DevSecOps
- SOC 2 and ISO 27001
- Incident Response
- Cloud Security
- Zero Trust
- IAM
- Vulnerability Management
- Governance and risk management`;

  const jdShort = `Requirements
- Python
- AWS
- Kubernetes`;

  const jdEmpty = "";

  const jdLocationLeak = `About Us
Acme is headquartered in Zurich.
We have offices in London, Berlin, and Singapore.

Requirements
- TypeScript
- PostgreSQL
- Docker
- Terraform`;

  const fixtures = [
    { name: "cohere-shape rich profile (§1.2 divergence case)",
      jd: jdCohere,
      profile: 33 },
    { name: "cohere-shape mid profile",
      jd: jdCohere,
      profile: 15 },
    { name: "cohere-shape focused profile",
      jd: jdCohere,
      profile: 5 },
    { name: "small-JD rich profile — F1 vs Deno-old divergence",
      jd: jdShort,
      profile: 33 },
    { name: "small-JD focused profile",
      jd: jdShort,
      profile: 5 },
    { name: "empty-JD any profile",
      jd: jdEmpty,
      profile: 33 },
    { name: "location-leak JD (post-#394 geo-strip)",
      jd: jdLocationLeak,
      profile: 20 },
  ];

  for (const fx of fixtures) {
    it(fx.name, () => {
      const nodeJdSkills = extractNode(fx.jd);
      const denoJdSkills = extractDeno(fx.jd);
      // Extractor must produce byte-identical output on both sides.
      expect(denoJdSkills).toEqual(nodeJdSkills);

      // Scorer must produce byte-identical output on both sides for the
      // same matched count (test all matched values 0..min(profile, jd)+2).
      const jd_n = nodeJdSkills.length;
      const upper = Math.max(3, Math.min(fx.profile, jd_n) + 2);
      for (let matched = 0; matched <= upper; matched++) {
        const nodeScore = f4SkillsScore(matched, fx.profile, jd_n);
        const denoScore = denoF4(matched, fx.profile, jd_n);
        expect(denoScore).toBe(nodeScore);
      }
    });
  }
});

// ── Sanity vs current formula (documents the expected lift, not a
// regression guard — the new formula IS the regression) ──

describe("F4 — expected lift over F1 (documentation only)", () => {
  it("Cohere-shape rich profile: matched=3, profile=33, jd=13 → F4=23 (was F1=9)", () => {
    // F1: matched / max(profile, jd, 1) = 3 / max(33, 13, 1) = 3/33 = 9
    // F4: matched / max(min(profile, jd), 10) = 3 / max(min(33,13), 10) = 3/13 = 23
    expect(f4SkillsScore(3, 33, 13)).toBe(23);
  });

  it("Small-profile guard: matched=3, profile=5, jd=25 → F4=30 (not the naive min-only F2=60)", () => {
    // F2 would give 3/min(5,25) = 3/5 = 60.
    // F4 gives 3/max(min(5,25),10) = 3/10 = 30. Guards against inflation.
    expect(f4SkillsScore(3, 5, 25)).toBe(30);
  });
});
