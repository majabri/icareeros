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
