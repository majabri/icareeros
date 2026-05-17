/**
 * AuthForm — Phase 1 subdomain test
 *
 * Verifies that completing the signup form with a selected role
 * inserts the correct {user_id, role} row into user_roles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────────
const upsertSpy = vi.fn(async () => ({ data: null, error: null }));
const fromMock  = vi.fn((table: string) => {
  return {
    upsert: (...args: unknown[]) => upsertSpy(table, ...args),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  };
});

const signUpMock = vi.fn(async () => ({
  data: { user: { id: "user-1" } },
  error: null,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      signUp: signUpMock,
      resend: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    from: fromMock,
  }),
}));

vi.mock("@/components/auth/SocialLogins", () => ({
  SocialLogins: () => null,
}));

vi.mock("@/components/legal/ConsentCheckboxes", () => ({
  ConsentCheckboxes: ({ onChange }: { onChange: (s: unknown, ok: boolean) => void }) => (
    <button
      type="button"
      data-testid="grant-consent"
      onClick={() =>
        onChange({ privacyTerms: true, aiProcessing: true, marketingEmail: false }, true)
      }
    >
      grant
    </button>
  ),
}));

vi.mock("@/app/actions/consentActions", () => ({
  recordSignupConsent: vi.fn(async () => undefined),
}));

import { AuthForm } from "../AuthForm";

describe("AuthForm signup — user_roles insert", () => {
  beforeEach(() => {
    upsertSpy.mockClear();
    fromMock.mockClear();
    signUpMock.mockClear();
  });

  it("inserts {user_id, role: 'job_seeker'} when the job-seeker card is selected", async () => {
    render(<AuthForm mode="signup" />);

    // Pick the job-seeker role card. The button is identified by its text.
    fireEvent.click(screen.getByText(/I'm looking for a job/));

    // Grant consent via the stubbed component.
    fireEvent.click(screen.getByTestId("grant-consent"));

    // Fill email + password.
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: "amy@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i),      { target: { value: "Sup3rSecret!" } });

    // Submit.
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Create account/i }));
    });

    // signUp was called.
    expect(signUpMock).toHaveBeenCalledTimes(1);

    // user_roles upsert was invoked with the right shape.
    const userRolesCall = upsertSpy.mock.calls.find(([table]) => table === "user_roles");
    expect(userRolesCall, "user_roles upsert should fire").toBeTruthy();
    expect(userRolesCall![1]).toEqual({ user_id: "user-1", role: "job_seeker" });
  });

  it("inserts {role: 'employer'} when the recruiter card is selected via initialRole prop", async () => {
    render(<AuthForm mode="signup" initialRole="employer" />);

    fireEvent.click(screen.getByTestId("grant-consent"));
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: "ed@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i),      { target: { value: "Sup3rSecret!" } });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Create account/i }));
    });

    const userRolesCall = upsertSpy.mock.calls.find(([table]) => table === "user_roles");
    expect(userRolesCall, "user_roles upsert should fire").toBeTruthy();
    expect(userRolesCall![1]).toEqual({ user_id: "user-1", role: "employer" });
  });
});
