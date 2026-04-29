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

import { jobAlertEmail } from "@/lib/emailTemplates";

describe("jobAlertEmail", () => {
  const jobs = [
    {
      title: "Senior Engineer",
      company: "Acme Corp",
      location: "New York, NY",
      is_remote: false,
      job_type: "full-time",
      salary_min: 120000,
      salary_max: 160000,
      url: "https://jobs.example.com/1",
    },
    {
      title: "Product Manager",
      company: "Beta Inc",
      location: null,
      is_remote: true,
      job_type: null,
      salary_min: null,
      salary_max: null,
      url: null,
    },
  ];

  it("includes job count in subject", () => {
    const { subject } = jobAlertEmail("engineer", jobs, "daily");
    expect(subject).toContain("2");
    expect(subject).toContain("iCareerOS");
  });

  it("includes query filter in subject", () => {
    const { subject } = jobAlertEmail("product manager", jobs, "weekly");
    expect(subject).toContain("product manager");
  });

  it("uses generic label when no query", () => {
    const { subject } = jobAlertEmail(null, jobs, "daily");
    expect(subject).toContain("for you");
  });

  it("HTML contains job titles", () => {
    const { html } = jobAlertEmail(null, jobs, "daily");
    expect(html).toContain("Senior Engineer");
    expect(html).toContain("Acme Corp");
  });

  it("HTML contains salary range", () => {
    const { html } = jobAlertEmail(null, jobs, "daily");
    expect(html).toContain("120k");
    expect(html).toContain("160k");
  });

  it("limits to 5 jobs in output", () => {
    const manyJobs = Array.from({ length: 10 }, (_, i) => ({
      ...jobs[0],
      title: `Job ${i}`,
    }));
    const { html } = jobAlertEmail(null, manyJobs, "daily");
    const count = (html.match(/Job \d/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(5);
  });

  it("text fallback lists job titles", () => {
    const { text } = jobAlertEmail(null, jobs, "daily");
    expect(text).toContain("Senior Engineer");
    expect(text).toContain("Acme Corp");
  });
});
