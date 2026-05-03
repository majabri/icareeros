/**
 * Smoke tests for the resume-intake form schema (SPEC-002 §2.3).
 * Lightweight — validates the shape contract; we don't test the rendered
 * component because react-hook-form + jsdom + drag-drop is heavy and
 * the spec asks for a small set, not exhaustive coverage.
 */

import { describe, it, expect } from "vitest";
import { profileSchema } from "@/types/profile";

describe("profileSchema", () => {
  it("accepts a minimal valid profile", () => {
    const r = profileSchema.safeParse({
      full_name: "Jane Doe",
      email: "jane@example.com",
      raw_text_format: "manual",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing name", () => {
    const r = profileSchema.safeParse({
      email: "jane@example.com",
      raw_text_format: "manual",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const r = profileSchema.safeParse({
      full_name: "Jane",
      email: "not-an-email",
      raw_text_format: "manual",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a full nested profile with work history + education + skills", () => {
    const r = profileSchema.safeParse({
      full_name: "Jane Doe",
      email: "jane@example.com",
      phone: "(415) 555-1234",
      location: "San Francisco, CA",
      headline: "Senior PM",
      summary: "Experienced product manager with 8 years building B2B SaaS.",
      work_history: [{
        title: "Senior PM", company: "Acme", location: "SF",
        start: "2022-01", end: "", current: true, bullets: ["Shipped X", "Grew Y by 30%"],
      }],
      education: [{
        school: "MIT", degree: "B.S.", field: "Computer Science",
        start: "2014", end: "2018",
      }],
      skills: ["TypeScript", "React", "Product Strategy"],
      raw_text: "Jane Doe...",
      raw_text_format: "pdf",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown raw_text_format", () => {
    const r = profileSchema.safeParse({
      full_name: "Jane",
      email: "jane@example.com",
      raw_text_format: "rtf", // not in enum
    });
    expect(r.success).toBe(false);
  });

  it("requires title and company on each work_history entry", () => {
    const r = profileSchema.safeParse({
      full_name: "Jane",
      email: "jane@example.com",
      raw_text_format: "manual",
      work_history: [{ title: "", company: "Acme", start: "2024-01" }],
    });
    expect(r.success).toBe(false);
  });
});
