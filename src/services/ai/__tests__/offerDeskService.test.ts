/**
 * offerDeskService unit tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobOffer, NegotiationResult } from "../offerDeskService";

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock Supabase ──────────────────────────────────────────────────────────────

const mockSelect = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockReturnThis();
const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  delete: mockDelete,
  update: mockUpdate,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

const {
  createOffer,
  listOffers,
  updateOfferStatus,
  deleteOffer,
  analyzeNegotiation,
} = await import("../offerDeskService");

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_OFFER: JobOffer = {
  id: "offer-1",
  user_id: "user-1",
  company: "Google",
  role_title: "Senior Software Engineer",
  base_salary: 180000,
  total_comp: 280000,
  equity: "200 RSUs over 4 years",
  bonus: "15% annual target",
  benefits: "Full medical, 401k 6%",
  deadline: "2026-05-15",
  status: "received",
  notes: "Competing offer from Meta",
  negotiation_result: null,
  created_at: "2026-04-29T10:00:00Z",
  updated_at: "2026-04-29T10:00:00Z",
};

const SAMPLE_NEGOTIATION: NegotiationResult = {
  strategy: "You have strong leverage with a competing offer from Meta.",
  talkingPoints: ["Competing offer", "Strong performance record", "Specialized skills"],
  counterOfferRange: { low: 195000, high: 210000 },
  emailTemplate: "Dear [Recruiter], I'm very excited about the opportunity...",
  riskLevel: "low",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnThis();
  mockInsert.mockReturnThis();
  mockDelete.mockReturnThis();
  mockUpdate.mockReturnThis();
  mockEq.mockReturnThis();
  mockOrder.mockReturnThis();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("createOffer", () => {
  it("inserts and returns the new offer", async () => {
    mockSingle.mockResolvedValueOnce({ data: SAMPLE_OFFER, error: null });

    const result = await createOffer({ company: "Google", role_title: "Senior SWE", base_salary: 180000 });

    expect(mockFrom).toHaveBeenCalledWith("job_offers");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ company: "Google", role_title: "Senior SWE" }));
    expect(result.company).toBe("Google");
    expect(result.base_salary).toBe(180000);
  });

  it("throws on Supabase error", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "RLS denied" } });

    await expect(createOffer({ company: "X", role_title: "Y" })).rejects.toThrow("RLS denied");
  });
});

describe("listOffers", () => {
  it("returns offers ordered by created_at desc", async () => {
    mockOrder.mockResolvedValueOnce({ data: [SAMPLE_OFFER], error: null });

    const result = await listOffers();

    expect(mockFrom).toHaveBeenCalledWith("job_offers");
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toHaveLength(1);
    expect(result[0].company).toBe("Google");
  });

  it("returns empty array when no offers", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const result = await listOffers();
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "connection error" } });
    await expect(listOffers()).rejects.toThrow("connection error");
  });
});

describe("updateOfferStatus", () => {
  it("calls update with the correct status", async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await updateOfferStatus("offer-1", "negotiating");

    expect(mockFrom).toHaveBeenCalledWith("job_offers");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "negotiating" });
    expect(mockEq).toHaveBeenCalledWith("id", "offer-1");
  });

  it("throws on Supabase error", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "not found" } });
    await expect(updateOfferStatus("bad-id", "accepted")).rejects.toThrow("not found");
  });
});

describe("deleteOffer", () => {
  it("calls delete with the correct id", async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await deleteOffer("offer-1");

    expect(mockFrom).toHaveBeenCalledWith("job_offers");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "offer-1");
  });

  it("throws on Supabase error", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "delete failed" } });
    await expect(deleteOffer("bad")).rejects.toThrow("delete failed");
  });
});

describe("analyzeNegotiation", () => {
  it("calls /api/career-os/negotiate with correct body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_NEGOTIATION });

    const result = await analyzeNegotiation({ offerId: "offer-1", targetSalary: 200000, priorities: ["Higher base salary"] });

    expect(mockFetch).toHaveBeenCalledWith("/api/career-os/negotiate", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.offer_id).toBe("offer-1");
    expect(body.target_salary).toBe(200000);
    expect(body.priorities).toContain("Higher base salary");
    expect(result.riskLevel).toBe("low");
  });

  it("returns negotiation result with all required fields", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_NEGOTIATION });

    const result = await analyzeNegotiation({ offerId: "offer-1" });

    expect(typeof result.strategy).toBe("string");
    expect(Array.isArray(result.talkingPoints)).toBe(true);
    expect(result.counterOfferRange).not.toBeNull();
    expect(typeof result.emailTemplate).toBe("string");
  });

  it("throws if API returns error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: "Offer not found" }) });
    await expect(analyzeNegotiation({ offerId: "bad" })).rejects.toThrow("Offer not found");
  });

  it("handles null counterOfferRange for non-salary offers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SAMPLE_NEGOTIATION, counterOfferRange: null }),
    });
    const result = await analyzeNegotiation({ offerId: "offer-1" });
    expect(result.counterOfferRange).toBeNull();
  });
});
