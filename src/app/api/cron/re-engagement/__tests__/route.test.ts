import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/emailTemplates", () => ({
  reEngagementEmail: vi.fn().mockReturnValue({
    subject: "Come back",
    html: "<p>Come back</p>",
    text: "Come back",
  }),
}));

// Supabase mock
const mockSelectChain = {
  lte: vi.fn(),
  gte: vi.fn(),
  not: vi.fn(),
  in: vi.fn(),
  select: vi.fn(),
};
mockSelectChain.lte.mockReturnValue(mockSelectChain);
mockSelectChain.gte.mockReturnValue(mockSelectChain);
mockSelectChain.not.mockReturnValue({ data: [], error: null });
mockSelectChain.in.mockReturnValue({ data: [], error: null });
mockSelectChain.select.mockReturnValue(mockSelectChain);

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: () => mockSelectChain })),
  })),
}));

import { POST } from "../route";
import { sendMail } from "@/lib/mailer";

function makeReq(secret?: string) {
  return new Request("http://localhost/api/cron/re-engagement", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  // Reset chain defaults
  mockSelectChain.lte.mockReturnValue(mockSelectChain);
  mockSelectChain.gte.mockReturnValue(mockSelectChain);
  mockSelectChain.not.mockReturnValue({ data: [], error: null });
  mockSelectChain.in.mockReturnValue({ data: [], error: null });
});

describe("POST /api/cron/re-engagement", () => {
  it("returns 401 without valid secret", async () => {
    const res = await POST(makeReq("wrong") as any);
    expect(res.status).toBe(401);
  });

  it("returns 401 with no auth header", async () => {
    const res = await POST(makeReq() as any);
    expect(res.status).toBe(401);
  });

  it("returns sent:0 when no inactive users", async () => {
    const res = await POST(makeReq("test-secret") as any);
    const body = await res.json();
    expect(body.sent).toBe(0);
  });

  it("sends email to opted-in inactive users", async () => {
    const profile = {
      user_id: "u1",
      email: "user@example.com",
      updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      current_stage: "advise",
    };
    // Return profile on first .not() call
    mockSelectChain.not.mockReturnValueOnce({ data: [profile], error: null });
    // Return empty prefs on .in() call
    mockSelectChain.in.mockReturnValueOnce({ data: [], error: null });

    const res = await POST(makeReq("test-secret") as any);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("skips users who have opted out", async () => {
    const profile = { user_id: "u2", email: "out@example.com", updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), current_stage: null };
    mockSelectChain.not.mockReturnValueOnce({ data: [profile], error: null });
    mockSelectChain.in.mockReturnValueOnce({ data: [{ user_id: "u2", unsubscribe_token: "tok", weekly_insights: false }], error: null });

    const res = await POST(makeReq("test-secret") as any);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
