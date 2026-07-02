/**
 * feat/jobs-smart-apply — /api/resume/generate route tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("@/lib/supabase-cookie-options", () => ({ withCrossSubdomainCookie: (o: unknown) => o }));
vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: () => ({ messages: { create: vi.fn() } }),
}));

function req(body: unknown): Request {
  return new Request("http://localhost/api/resume/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withSb(config: { user?: { id: string } | null; profileRow?: Record<string, unknown> | null }) {
  const { createServerClient } = await import("@supabase/ssr");
  (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: config.user ?? null }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: config.profileRow ?? null, error: null }),
        }),
      }),
    }),
  });
}

let POST: typeof import("../route").POST;
beforeEach(async () => {
  vi.resetModules();
  POST = (await import("../route")).POST;
});

describe("/api/resume/generate", () => {
  it("returns 401 for unauthenticated requests", async () => {
    await withSb({ user: null });
    const r = await POST(req({ jobTitle: "X", jobDescription: "Y", targetCompany: "Z" }));
    expect(r.status).toBe(401);
  });

  it("returns 400 when body fields are missing", async () => {
    await withSb({ user: { id: "user-1" }, profileRow: {} });
    const r = await POST(req({ jobTitle: "Engineer" }));
    expect(r.status).toBe(400);
  });

  it("returns 422 when the user has no work_experience in their profile", async () => {
    await withSb({ user: { id: "user-1" }, profileRow: { work_experience: [] } });
    const r = await POST(req({ jobTitle: "Engineer", targetCompany: "Stripe", jobDescription: "Build things and ship." }));
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body.error).toMatch(/work experience/i);
  });
});
