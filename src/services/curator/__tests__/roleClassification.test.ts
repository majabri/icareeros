/**
 * feat/jobs-multi-industry-coverage — role classification + industry
 * inference + title normalisation tests.
 */
import { describe, it, expect } from "vitest";
import {
  classifyIntoRoleFamilies,
  inferSeniorityTier,
  inferIndustries,
  normalizeTitle,
} from "../roleClassification";

describe("classifyIntoRoleFamilies", () => {
  it("Director of Security → director_of_security family", () => {
    expect(classifyIntoRoleFamilies("Director of Security")).toContain("director_of_security");
  });
  it("CISO → ciso family", () => {
    expect(classifyIntoRoleFamilies("Chief Information Security Officer")).toContain("ciso");
  });
  it("Field CISO → ciso family (via 'field ciso' synonym)", () => {
    expect(classifyIntoRoleFamilies("Field Chief Information Security Officer (Field CISO)")).toContain("ciso");
  });
  it("Senior Security Architect → security_architect family", () => {
    const families = classifyIntoRoleFamilies("Senior Security Architect");
    expect(families).toContain("security_architect");
  });
  it("CFO → cfo family", () => {
    expect(classifyIntoRoleFamilies("CFO")).toContain("cfo");
  });
  it("Director of Nursing → empty (not in taxonomy yet)", () => {
    // Explicitly no nursing family — we surface via industry classifier instead
    expect(classifyIntoRoleFamilies("Director of Nursing")).toEqual([]);
  });
  it("Chief Marketing Officer → cmo family", () => {
    expect(classifyIntoRoleFamilies("Chief Marketing Officer")).toContain("cmo");
  });
});

describe("inferSeniorityTier", () => {
  it("intern / junior / associate / mid / senior / staff / principal / director / vp / executive", () => {
    expect(inferSeniorityTier("Intern — Summer 2027")).toBe("intern");
    expect(inferSeniorityTier("Junior Analyst")).toBe("junior");
    expect(inferSeniorityTier("Associate Engineer")).toBe("associate");
    expect(inferSeniorityTier("Engineering Manager")).toBe("mid");
    expect(inferSeniorityTier("Senior Data Engineer")).toBe("senior");
    expect(inferSeniorityTier("Staff Engineer")).toBe("staff");
    expect(inferSeniorityTier("Principal Architect")).toBe("principal");
    expect(inferSeniorityTier("Director of Security")).toBe("director");
    expect(inferSeniorityTier("VP Product")).toBe("vp");
    expect(inferSeniorityTier("CISO")).toBe("executive");
    expect(inferSeniorityTier("Chief Marketing Officer")).toBe("executive");
  });
  it("BISO → director tier (not executive)", () => {
    expect(inferSeniorityTier("BISO")).toBe("director");
  });
  it("description fallback: '10+ years experience' → senior", () => {
    expect(inferSeniorityTier("Software Engineer", "Requires 10+ years experience")).toBe("senior");
  });
  it("Sr. prefix normalises to senior", () => {
    expect(inferSeniorityTier("Sr. Product Manager")).toBe("senior");
  });
});

describe("inferIndustries", () => {
  it("bank keyword → financial_services", () => {
    expect(inferIndustries("Acme Trust", "We are a private bank offering wealth management.")).toContain("financial_services");
  });
  it("pharma keyword → life_sciences", () => {
    expect(inferIndustries("Genecure Bio", "We manufacture pharma products for clinical trials.")).toContain("life_sciences");
  });
  it("nursing keyword → healthcare", () => {
    expect(inferIndustries("Regional Health", "Nursing team supporting our patient care initiatives.")).toContain("healthcare");
  });
  it("Ramp brand hint → fintech + financial_services", () => {
    const ind = inferIndustries("ramp", "Corporate cards for modern finance teams.");
    expect(ind).toEqual(expect.arrayContaining(["fintech", "financial_services"]));
  });
  it("Vanta brand hint → saas + cybersecurity", () => {
    const ind = inferIndustries("vanta", "Compliance automation for SOC 2, ISO 27001.");
    expect(ind).toEqual(expect.arrayContaining(["saas", "cybersecurity"]));
  });
  it("gaming keyword → media", () => {
    expect(inferIndustries("Studio X", "We ship AAA games across platforms.")).toContain("media");
  });
  it("consulting keyword → consulting", () => {
    expect(inferIndustries("Advisory Co", "Strategic consulting for Fortune 500 clients.")).toContain("consulting");
  });
  it("aerospace + security clearance → defense", () => {
    expect(inferIndustries("Aerodyne", "Aerospace division — requires TS/SCI security clearance.")).toContain("defense");
  });
});

describe("normalizeTitle", () => {
  it("expands Sr. → senior", () => {
    expect(normalizeTitle("Sr. Director, InfoSec")).toContain("senior");
    expect(normalizeTitle("Sr. Director, InfoSec")).toContain("information security");
  });
  it("expands VP → vice president", () => {
    expect(normalizeTitle("VP, Global Sales")).toBe("vice president global sales");
  });
  it("expands CISO → chief information security officer", () => {
    expect(normalizeTitle("CISO")).toBe("chief information security officer");
  });
  it("expands BISO → business information security officer", () => {
    expect(normalizeTitle("BISO")).toBe("business information security officer");
  });
  it("replaces commas and dashes with spaces", () => {
    expect(normalizeTitle("Director, Product-Management")).toBe("director product management");
  });
  it("returns empty for null / empty input", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle(null as unknown as string)).toBe("");
  });
});

describe("classifyIntoRoleFamilies + inferSeniorityTier — regression", () => {
  it("Field CISO title yields ciso family + executive tier", () => {
    const t = "Field Chief Information Security Officer (Field CISO)";
    expect(classifyIntoRoleFamilies(t)).toContain("ciso");
    expect(inferSeniorityTier(t)).toBe("executive");
  });
  it("VP Sales title yields vp_sales family + vp tier", () => {
    const t = "VP of Sales, North America";
    expect(classifyIntoRoleFamilies(t)).toContain("vp_sales");
    expect(inferSeniorityTier(t)).toBe("vp");
  });
});
