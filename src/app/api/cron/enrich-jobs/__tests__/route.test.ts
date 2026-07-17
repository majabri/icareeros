/**
 * fix/jobs-pipeline-crons — proxy route tests for enrich-jobs.
 * Mirrors curate-user-recommendations/__tests__ pattern from PR #371.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy";
process.env.SUPABASE_SERVICE_ROLE_KEY     = "dummy-service-role";
process.env.CRON_SECRET                   = "dummy-secret";

import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({}),
  createServerClient:  () => ({}),
}));

import { GET, POST } from "../route";

function reqWith(auth: string | undefined): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("http://localhost/api/cron/enrich-jobs", { method: "POST", headers });
}

describe("cron/enrich-jobs proxy route", () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it("rejects wrong Bearer token with 401", async () => {
    const res = await POST(reqWith("Bearer wrong") as any);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to the edge function with the correct target URL", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ processed: 5 }), { status: 200 }));
    await POST(reqWith("Bearer dummy-secret") as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/functions/v1/enrich-jobs");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer dummy-service-role");
    expect(init.headers["x-cron-secret"]).toBe("dummy-secret");
  });

  it("returns 502 when the edge function returns non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("fail", { status: 500 }));
    const res = await POST(reqWith("Bearer dummy-secret") as any);
    expect(res.status).toBe(502);
    const b = await res.json();
    expect(b.ok).toBe(false);
  });

  it("returns 500 when the fetch itself throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await POST(reqWith("Bearer dummy-secret") as any);
    expect(res.status).toBe(500);
    const b = await res.json();
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/connection refused/);
  });

  it("GET aliases to POST (Vercel Cron sends GET by default)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const res = await GET(reqWith("Bearer dummy-secret") as any);
    expect(res.status).toBe(200);
  });
});
