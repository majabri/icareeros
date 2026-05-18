import { describe, it, expect } from "vitest";
import { postLoginDestination } from "../postLoginDestination";

const base = {
  requestedRedirect: null,
  isProdHost: true,
  jobsUrl:  "https://jobs.icareeros.com",
  hireUrl: "https://hire.icareeros.com",
};

describe("postLoginDestination", () => {
  it("admin always goes to /admin", () => {
    expect(postLoginDestination({
      ...base, isAdmin: true, isEmployer: false, isJobSeeker: true,
    })).toBe("/admin");
    expect(postLoginDestination({
      ...base, isAdmin: true, isEmployer: true, isJobSeeker: true, requestedRedirect: "/dashboard",
    })).toBe("/admin");
  });

  it("dual-role (employer + job_seeker) → /auth/choose-platform", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: true, isJobSeeker: true,
    })).toBe("/auth/choose-platform");
  });

  it("employer only → hireUrl/dashboard in prod", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: true, isJobSeeker: false,
    })).toBe("https://hire.icareeros.com/dashboard");
  });

  it("employer only → /hire/dashboard in dev", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: true, isJobSeeker: false, isProdHost: false,
    })).toBe("/hire/dashboard");
  });

  it("job_seeker only → jobsUrl/dashboard in prod", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: false, isJobSeeker: true,
    })).toBe("https://jobs.icareeros.com/dashboard");
  });

  it("no roles → defaults to jobsUrl (job seeker)", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: false, isJobSeeker: false,
    })).toBe("https://jobs.icareeros.com/dashboard");
  });

  it("explicit non-admin ?redirect= wins over role routing", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: false, isJobSeeker: true,
      requestedRedirect: "/settings/account",
    })).toBe("/settings/account");
  });

  it("explicit ?redirect=/admin is ignored for non-admins", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: false, isJobSeeker: true,
      requestedRedirect: "/admin",
    })).toBe("https://jobs.icareeros.com/dashboard");
  });

  it("uses provided env URLs, not hardcoded ones", () => {
    expect(postLoginDestination({
      ...base, isAdmin: false, isEmployer: true, isJobSeeker: false,
      hireUrl: "https://custom-hired.example.com",
    })).toBe("https://custom-hired.example.com/dashboard");
  });
});
