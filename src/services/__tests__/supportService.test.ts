import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchMyTickets,
  createTicket,
  statusLabel,
  statusBadgeClass,
  priorityBadgeClass,
  type SupportTicket,
} from "../supportService";

const MOCK_TICKET: SupportTicket = {
  id: "ticket-1",
  subject: "Cannot access my dashboard",
  body: "When I log in the dashboard shows a blank screen.",
  priority: "normal",
  status: "open",
  created_at: "2026-04-29T10:00:00Z",
  updated_at: "2026-04-29T10:00:00Z",
};

function mockFetch(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

// ── fetchMyTickets ────────────────────────────────────────────────────────────

describe("fetchMyTickets", () => {
  it("returns ticket array on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ tickets: [MOCK_TICKET] }));
    const tickets = await fetchMyTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe("Cannot access my dashboard");
  });

  it("calls GET /api/support", async () => {
    const spy = mockFetch({ tickets: [] });
    vi.stubGlobal("fetch", spy);
    await fetchMyTickets();
    expect(spy).toHaveBeenCalledWith("/api/support");
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Unauthorised" }, 401));
    await expect(fetchMyTickets()).rejects.toThrow("Unauthorised");
  });

  it("returns empty array when tickets is []", async () => {
    vi.stubGlobal("fetch", mockFetch({ tickets: [] }));
    const tickets = await fetchMyTickets();
    expect(tickets).toEqual([]);
  });
});

// ── createTicket ──────────────────────────────────────────────────────────────

describe("createTicket", () => {
  it("returns created ticket on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ ticket: MOCK_TICKET }, 201));
    const ticket = await createTicket({ subject: "Cannot access my dashboard", body: "Blank screen." });
    expect(ticket.id).toBe("ticket-1");
    expect(ticket.status).toBe("open");
  });

  it("sends POST to /api/support with JSON body", async () => {
    const spy = mockFetch({ ticket: MOCK_TICKET }, 201);
    vi.stubGlobal("fetch", spy);
    await createTicket({ subject: "Bug", body: "Details here.", priority: "high" });
    expect(spy).toHaveBeenCalledWith("/api/support", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: JSON.stringify({ subject: "Bug", body: "Details here.", priority: "high" }),
    }));
  });

  it("defaults priority to undefined (server decides) when not supplied", async () => {
    const spy = mockFetch({ ticket: MOCK_TICKET }, 201);
    vi.stubGlobal("fetch", spy);
    await createTicket({ subject: "Question", body: "How do I export my data?" });
    const body = JSON.parse((spy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.priority).toBeUndefined();
  });

  it("throws on non-OK response with server error message", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "body must be 10–5000 characters" }, 400));
    await expect(createTicket({ subject: "Hi", body: "Short" })).rejects.toThrow("body must be 10–5000 characters");
  });
});

// ── utility functions ─────────────────────────────────────────────────────────

describe("statusLabel", () => {
  it("maps each status to a human label", () => {
    expect(statusLabel("open")).toBe("Open");
    expect(statusLabel("in_progress")).toBe("In Progress");
    expect(statusLabel("resolved")).toBe("Resolved");
    expect(statusLabel("closed")).toBe("Closed");
  });
});

describe("statusBadgeClass", () => {
  it("returns a non-empty string for each status", () => {
    for (const status of ["open", "in_progress", "resolved", "closed"] as const) {
      expect(statusBadgeClass(status).length).toBeGreaterThan(0);
    }
  });

  it("open uses blue colours", () => {
    expect(statusBadgeClass("open")).toContain("blue");
  });

  it("resolved uses green colours", () => {
    expect(statusBadgeClass("resolved")).toContain("green");
  });
});

describe("priorityBadgeClass", () => {
  it("returns a non-empty string for each priority", () => {
    for (const p of ["low", "normal", "high", "urgent"] as const) {
      expect(priorityBadgeClass(p).length).toBeGreaterThan(0);
    }
  });

  it("urgent uses red colours", () => {
    expect(priorityBadgeClass("urgent")).toContain("red");
  });
});
