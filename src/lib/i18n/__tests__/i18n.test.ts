import { describe, it, expect } from "vitest";
import { en } from "../en";
import { es } from "../es";
import { fr } from "../fr";
import { de } from "../de";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_LABELS } from "../types";
import type { Translations } from "../types";

function getLeafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    getLeafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("Translation completeness", () => {
  const enKeys = getLeafKeys(en).sort();

  for (const [locale, dict] of [["es", es], ["fr", fr], ["de", de]] as [string, Translations][]) {
    it(`${locale} has exactly the same keys as en`, () => {
      const keys = getLeafKeys(dict).sort();
      expect(keys).toEqual(enKeys);
    });
  }
});

describe("English translations", () => {
  it("hero headline is non-empty", () => {
    expect(en.landing.heroHeadline.length).toBeGreaterThan(10);
  });

  it("all nav entries are non-empty strings", () => {
    for (const [key, val] of Object.entries(en.nav)) {
      expect(typeof val, `nav.${key}`).toBe("string");
      expect((val as string).length, `nav.${key}`).toBeGreaterThan(0);
    }
  });

  it("all common entries are non-empty strings", () => {
    for (const [key, val] of Object.entries(en.common)) {
      expect(typeof val, `common.${key}`).toBe("string");
      expect((val as string).length, `common.${key}`).toBeGreaterThan(0);
    }
  });

  it("dashboard stages has all 6 Career OS stages", () => {
    const stages = Object.keys(en.dashboard.stages);
    expect(stages).toContain("evaluate");
    expect(stages).toContain("advise");
    expect(stages).toContain("learn");
    expect(stages).toContain("act");
    expect(stages).toContain("coach");
    expect(stages).toContain("achieve");
  });
});

describe("Spanish translations", () => {
  it("key UI strings differ from English", () => {
    expect(es.nav.opportunities).not.toBe(en.nav.opportunities);
    expect(es.auth.signIn).not.toBe(en.auth.signIn);
    expect(es.common.save).not.toBe(en.common.save);
  });

  it("hero headline is translated (not same as en)", () => {
    expect(es.landing.heroHeadline).not.toBe(en.landing.heroHeadline);
    expect(es.landing.heroHeadline.length).toBeGreaterThan(10);
  });
});

describe("i18n constants", () => {
  it("SUPPORTED_LOCALES contains all 4 languages", () => {
    for (const l of ["en", "es", "fr", "de"]) {
      expect(SUPPORTED_LOCALES).toContain(l);
    }
  });

  it("DEFAULT_LOCALE is en", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("LOCALE_LABELS has a label for every supported locale", () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[l]).toBeTruthy();
    }
  });
});
