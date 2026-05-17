import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// AuthForm is a client component with its own Supabase wiring — stub
// it so the signup page test focuses on the role-prefill prop.
vi.mock("@/components/auth/AuthForm", () => ({
  AuthForm: ({ initialRole }: { initialRole?: string }) => (
    <div data-testid="auth-form" data-initial-role={initialRole ?? ""} />
  ),
}));

import SignupPage from "../page";

describe("SignupPage — role pre-selection from ?role=", () => {
  it("passes initialRole='job_seeker' when ?role=job_seeker", async () => {
    const ui = await SignupPage({
      searchParams: Promise.resolve({ role: "job_seeker" }),
    });
    render(ui);
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-initial-role")).toBe("job_seeker");
  });

  it("passes initialRole='employer' when ?role=employer", async () => {
    const ui = await SignupPage({
      searchParams: Promise.resolve({ role: "employer" }),
    });
    render(ui);
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-initial-role")).toBe("employer");
  });

  it("passes no initialRole when ?role is missing", async () => {
    const ui = await SignupPage({
      searchParams: Promise.resolve({}),
    });
    render(ui);
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-initial-role")).toBe("");
  });

  it("ignores invalid ?role values", async () => {
    const ui = await SignupPage({
      searchParams: Promise.resolve({ role: "ceo" }),
    });
    render(ui);
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-initial-role")).toBe("");
  });

  it("renders the new dual-audience heading copy", async () => {
    const ui = await SignupPage({
      searchParams: Promise.resolve({}),
    });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Join iCareerOS/);
    expect(screen.getByText(/Choose your path to get started\.?/i)).toBeTruthy();
  });
});
