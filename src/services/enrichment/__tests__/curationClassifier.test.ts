/**
 * feat/jobs-user-curation — tier classifier + reason string tests.
 * The full curator runs in Deno; these pure-fn tests mirror the classifier
 * so we can exercise it under vitest without Deno.
 */
import { describe, it, expect } from "vitest";

type Origin = "exact" | "adjacent" | "skills";
function classify(total: number, origin: Origin): "strongMatch" | "worthConsidering" | "stretch" | null {
  if (origin === "exact" && total >= 65) return "strongMatch";
  if (total >= 45 && total < 65) return "worthConsidering";
  if (total >= 30) return "stretch";
  return null;
}

function reasonFor(sig: { roleSignal: string; matchedSkills: string[]; missingSkills: string[]; roleBestMatch: string }): string {
  const parts: string[] = [];
  if (sig.roleSignal === "exact" && sig.roleBestMatch) parts.push(`Exact match for ${sig.roleBestMatch}`);
  else if (sig.roleSignal === "adjacent") parts.push("Adjacent to your target role");
  else if (sig.roleSignal === "stretch") parts.push("Stretch role");
  const tot = sig.matchedSkills.length + sig.missingSkills.length;
  if (tot > 0) parts.push(`${sig.matchedSkills.length} of ${tot} required skills match`);
  return parts.join(" · ");
}

describe("classify (PR 3)", () => {
  it("fit=80 origin=exact → strongMatch", () => expect(classify(80, "exact")).toBe("strongMatch"));
  it("fit=80 origin=adjacent → stretch (score above 30 but not eligible for strong)", () => expect(classify(80, "adjacent")).toBe("stretch"));
  it("fit=65 origin=exact → strongMatch (threshold)", () => expect(classify(65, "exact")).toBe("strongMatch"));
  it("fit=50 origin=adjacent → worthConsidering", () => expect(classify(50, "adjacent")).toBe("worthConsidering"));
  it("fit=45 → worthConsidering (threshold)", () => expect(classify(45, "adjacent")).toBe("worthConsidering"));
  it("fit=30 origin=skills → stretch (threshold)", () => expect(classify(30, "skills")).toBe("stretch"));
  it("fit=29 → null (drop)", () => expect(classify(29, "exact")).toBe(null));
});

describe("reasonFor (PR 3)", () => {
  it("exact match includes 'Exact match for X' and skill fraction", () => {
    const r = reasonFor({ roleSignal: "exact", roleBestMatch: "CISO", matchedSkills: ["AWS", "Python"], missingSkills: ["ML"] });
    expect(r).toBe("Exact match for CISO · 2 of 3 required skills match");
  });
  it("adjacent → 'Adjacent to your target role'", () => {
    const r = reasonFor({ roleSignal: "adjacent", roleBestMatch: "CISO", matchedSkills: [], missingSkills: [] });
    expect(r).toBe("Adjacent to your target role");
  });
  it("stretch → 'Stretch role'", () => {
    const r = reasonFor({ roleSignal: "stretch", roleBestMatch: "", matchedSkills: ["a"], missingSkills: ["b", "c"] });
    expect(r).toBe("Stretch role · 1 of 3 required skills match");
  });
  it("mismatch + zero skills → empty string", () => {
    const r = reasonFor({ roleSignal: "mismatch", roleBestMatch: "", matchedSkills: [], missingSkills: [] });
    expect(r).toBe("");
  });
  it("counts skills even when total match is 0", () => {
    const r = reasonFor({ roleSignal: "exact", roleBestMatch: "PM", matchedSkills: [], missingSkills: ["a", "b"] });
    expect(r).toBe("Exact match for PM · 0 of 2 required skills match");
  });
});
