import { describe, it, expect } from "vitest";
import { compareTexts, cosineToScore, cosineSimilarity, embed } from "../openai";

describe("local embeddings (TF-IDF + cosine)", () => {
  it("returns a score for matching resume and JD", () => {
    const resume = "Senior software engineer with 5 years Python Django REST API experience";
    const jd     = "We are looking for a Python engineer with Django and REST API skills";
    const cos = compareTexts(resume, jd);
    expect(cos).not.toBeNull();
    expect(cos!).toBeGreaterThan(0.1);
  });

  it("returns low score for unrelated texts", () => {
    const resume = "Professional chef with 10 years culinary experience";
    const jd     = "Senior software engineer Python machine learning";
    const cos = compareTexts(resume, jd);
    expect(cos).not.toBeNull();
    expect(cos!).toBeLessThan(0.3);
  });

  it("cosineToScore maps correctly", () => {
    expect(cosineToScore(0.0)).toBe(0);
    expect(cosineToScore(0.65)).toBe(100);
    expect(cosineToScore(0.35)).toBeGreaterThan(0);
    expect(cosineToScore(0.35)).toBeLessThan(100);
  });

  it("cosineSimilarity returns null on empty vectors", () => {
    expect(cosineSimilarity([], [])).toBeNull();
  });

  it("embed returns a 512-dim vector for non-empty text", async () => {
    const v = await embed("Senior software engineer Python Django REST");
    expect(v).not.toBeNull();
    expect(v!.length).toBe(512);
  });

  it("embed returns null on empty input", async () => {
    expect(await embed("")).toBeNull();
    expect(await embed("   ")).toBeNull();
  });

  it("compareTexts returns null when either input is empty", () => {
    expect(compareTexts("hello world", "")).toBeNull();
    expect(compareTexts("", "hello world")).toBeNull();
  });
});
