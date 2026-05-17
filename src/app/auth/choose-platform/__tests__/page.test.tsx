import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ChoosePlatformPage from "../page";

// Mock next/headers cookies() and @supabase/ssr to keep this a pure
// render test — we just want both subdomain buttons to appear regardless
// of auth state.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => undefined,
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  })),
}));

describe("ChoosePlatformPage", () => {
  beforeEach(() => {
    // Don't rely on env vars in tests — fall back to the inline defaults.
    delete process.env.NEXT_PUBLIC_JOBS_URL;
    delete process.env.NEXT_PUBLIC_HIRED_URL;
  });

  it("renders both platform cards with their destination links", async () => {
    const ui = await ChoosePlatformPage();
    render(ui);

    // Headings inside each card
    expect(screen.getByText(/iCareerOS for Jobs/i)).toBeTruthy();
    expect(screen.getByText(/iCareerOS for Hiring/i)).toBeTruthy();

    // Each card is a link with the right destination
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/jobs\.icareeros\.com\/dashboard$/),
        expect.stringMatching(/hired\.icareeros\.com\/dashboard$/),
      ]),
    );
  });

  it("falls back to generic greeting when no user is loaded", async () => {
    const ui = await ChoosePlatformPage();
    render(ui);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Welcome back\.?/);
  });
});
