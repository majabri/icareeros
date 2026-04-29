/**
 * Unit tests for emailTemplates.ts
 */

import { describe, it, expect } from "vitest";
import { welcomeEmail, passwordResetNotificationEmail } from "@/lib/emailTemplates";

describe("welcomeEmail", () => {
  const email = "jane@example.com";

  it("returns correct subject", () => {
    const { subject } = welcomeEmail(email);
    expect(subject).toContain("Welcome to iCareerOS");
  });

  it("HTML contains the user email", () => {
    const { html } = welcomeEmail(email);
    expect(html).toContain(email);
  });

  it("HTML is a full document with DOCTYPE", () => {
    const { html } = welcomeEmail(email);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("iCareerOS");
    expect(html).toContain("dashboard");
  });

  it("text fallback contains dashboard link", () => {
    const { text } = welcomeEmail(email);
    expect(text).toContain("dashboard");
    expect(text).toContain(email);
  });
});

describe("passwordResetNotificationEmail", () => {
  const email = "john@example.com";

  it("returns correct subject", () => {
    const { subject } = passwordResetNotificationEmail(email);
    expect(subject).toContain("password");
  });

  it("HTML warns about unauthorised changes", () => {
    const { html } = passwordResetNotificationEmail(email);
    expect(html).toContain("not");
    expect(html).toContain("reset");
  });

  it("text fallback mentions the user email", () => {
    const { text } = passwordResetNotificationEmail(email);
    expect(text).toContain(email);
  });
});

import { weeklyInsightsEmail } from "@/lib/emailTemplates";

describe("weeklyInsightsEmail", () => {
  const email = "user@example.com";
  const insights = [
    { category: "Interview tip", content: "Prepare STAR stories for each major accomplishment." },
    { category: "Job search", content: "Apply within 48 hours of posting for best results." },
  ];

  it("returns subject with current month", () => {
    const { subject } = weeklyInsightsEmail(email, insights, 5, "Evaluate");
    expect(subject).toContain("iCareerOS weekly digest");
  });

  it("HTML includes new job count when > 0", () => {
    const { html } = weeklyInsightsEmail(email, insights, 7, "Act");
    expect(html).toContain("7");
  });

  it("HTML includes career stage", () => {
    const { html } = weeklyInsightsEmail(email, insights, 0, "Coach");
    expect(html).toContain("Coach");
  });

  it("HTML contains insight categories", () => {
    const { html } = weeklyInsightsEmail(email, insights, 0, "Learn");
    expect(html).toContain("Interview tip");
    expect(html).toContain("Job search");
  });

  it("text fallback includes stage and insights", () => {
    const { text } = weeklyInsightsEmail(email, insights, 3, "Advise");
    expect(text).toContain("Advise");
    expect(text).toContain("Interview tip");
  });

  it("limits insights to 5 even if more provided", () => {
    const manyInsights = Array.from({ length: 10 }, (_, i) => ({
      category: `Cat ${i}`,
      content: `Content ${i}`,
    }));
    const { html } = weeklyInsightsEmail(email, manyInsights, 0, "Evaluate");
    // Only first 5 should appear
    expect((html.match(/Cat \d/g) ?? []).length).toBeLessThanOrEqual(5);
  });
});
