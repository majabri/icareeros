/**
 * resumeService unit tests
 *
 * Tests pure logic functions and mocked network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedResume, ResumeVersion } from "../resumeService";

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock Supabase ──────────────────────────────────────────────────────────────

const mockSelect = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

const {
  parseResumeText,
  saveResumeVersion,
  listResumeVersions,
  deleteResumeVersion,
} = await import("../resumeService");

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_PARSED: ParsedResume = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: "555-0100", location: "SF, CA" },
  summary: "Experienced software engineer with 8 years in backend systems.",
  experience: [
    {
      title: "Senior Engineer",
      company: "Acme Corp",
      period: "2020–Present",
      bullets: ["Led migration to microservices", "Reduced latency by 40%"],
    },
  ],
  education: [{ degree: "B.S. Computer Science", school: "UC Berkeley", year: "2016" }],
  skills: ["TypeScript", "Node.js", "PostgreSQL"],
  certifications: ["AWS Solutions Architect"],
};

const SAMPLE_VERSION: ResumeVersion = {
  id: "rv-1",
  user_id: "u-1",
  version_name: "Software Engineer — Google",
  job_type: "Engineering",
  resume_text: "Jane Doe\njane@example.com\n...",
  parsed_data: SAMPLE_PARSED,
  created_at: "2026-04-29T10:00:00Z",
  updated_at: "2026-04-29T10:00:00Z",
};

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain mocks
  mockSelect.mockReturnThis();
  mockInsert.mockReturnThis();
  mockDelete.mockReturnThis();
  mockEq.mockReturnThis();
  mockOrder.mockReturnThis();
});

describe("parseResumeText", () => {
  it("calls /api/resume/parse with the correct body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_PARSED,
    });

    const result = await parseResumeText("Jane Doe\njane@example.com\nSenior Engineer at Acme");

    expect(mockFetch).toHaveBeenCalledWith("/api/resume/parse", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("Jane Doe");
    expect(result.contact.name).toBe("Jane Doe");
  });

  it("throws if API returns an error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Resume text is too short" }),
    });

    await expect(parseResumeText("Hi")).rejects.toThrow("Resume text is too short");
  });

  it("throws with fallback message if error body is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(parseResumeText("test")).rejects.toThrow("Parse failed (500)");
  });

  it("returns parsed resume with all required fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_PARSED,
    });

    const result = await parseResumeText("Jane Doe software engineer...");
    expect(result).toHaveProperty("contact");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("experience");
    expect(result).toHaveProperty("education");
    expect(result).toHaveProperty("skills");
    expect(result).toHaveProperty("certifications");
    expect(Array.isArray(result.skills)).toBe(true);
  });
});

describe("saveResumeVersion", () => {
  it("inserts and returns the saved version", async () => {
    mockSingle.mockResolvedValueOnce({ data: SAMPLE_VERSION, error: null });

    const result = await saveResumeVersion({
      versionName: "Software Engineer — Google",
      resumeText: "Jane Doe\njane@example.com",
      jobType: "Engineering",
      parsedData: SAMPLE_PARSED,
    });

    expect(mockFrom).toHaveBeenCalledWith("resume_versions");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        version_name: "Software Engineer — Google",
        job_type: "Engineering",
      })
    );
    expect(result.id).toBe("rv-1");
  });

  it("throws on Supabase error", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "RLS denied" } });

    await expect(
      saveResumeVersion({ versionName: "Test", resumeText: "text" })
    ).rejects.toThrow("RLS denied");
  });

  it("saves with null job_type when omitted", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...SAMPLE_VERSION, job_type: null },
      error: null,
    });

    const result = await saveResumeVersion({
      versionName: "General Resume",
      resumeText: "text",
    });

    expect(result.job_type).toBeNull();
  });
});

describe("listResumeVersions", () => {
  it("returns versions ordered by created_at desc", async () => {
    mockOrder.mockResolvedValueOnce({ data: [SAMPLE_VERSION], error: null });

    const result = await listResumeVersions();

    expect(mockFrom).toHaveBeenCalledWith("resume_versions");
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toHaveLength(1);
    expect(result[0].version_name).toBe("Software Engineer — Google");
  });

  it("returns empty array when no versions exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const result = await listResumeVersions();
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "connection error" } });

    await expect(listResumeVersions()).rejects.toThrow("connection error");
  });
});

describe("deleteResumeVersion", () => {
  it("calls delete with the correct id", async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await deleteResumeVersion("rv-1");

    expect(mockFrom).toHaveBeenCalledWith("resume_versions");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "rv-1");
  });

  it("throws on Supabase error", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "not found" } });

    await expect(deleteResumeVersion("bad-id")).rejects.toThrow("not found");
  });
});

describe("rewriteResume", () => {
  const SAMPLE_REWRITE = {
    rewrittenText: "Jane Doe\njane@example.com\n\nEXPERIENCE\nSenior Software Engineer | Acme Corp\nLed migration reducing latency by 40%",
    improvements: ["Stronger action verbs", "Quantified achievements", "ATS-optimized headers"],
    wordCount: 32,
  };

  it("calls /api/resume/rewrite with the correct body", async () => {
    const { rewriteResume } = await import("../resumeService");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_REWRITE,
    });

    const result = await rewriteResume({ resumeText: "Jane Doe engineer 8 years" });

    expect(mockFetch).toHaveBeenCalledWith("/api/resume/rewrite", expect.objectContaining({
      method: "POST",
    }));
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.resumeText).toBe("Jane Doe engineer 8 years");
    expect(result.improvements).toHaveLength(3);
  });

  it("passes targetRole and jobDescription when provided", async () => {
    const { rewriteResume } = await import("../resumeService");

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REWRITE });

    await rewriteResume({
      resumeText: "Jane Doe engineer",
      targetRole: "Senior SWE",
      jobDescription: "We need a senior engineer...",
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.targetRole).toBe("Senior SWE");
    expect(body.jobDescription).toBe("We need a senior engineer...");
  });

  it("throws if API returns an error", async () => {
    const { rewriteResume } = await import("../resumeService");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "resumeText is required" }),
    });

    await expect(rewriteResume({ resumeText: "x" })).rejects.toThrow("resumeText is required");
  });

  it("returns rewrittenText, improvements, and wordCount", async () => {
    const { rewriteResume } = await import("../resumeService");

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REWRITE });

    const result = await rewriteResume({ resumeText: "Jane Doe senior engineer" });
    expect(typeof result.rewrittenText).toBe("string");
    expect(Array.isArray(result.improvements)).toBe(true);
    expect(typeof result.wordCount).toBe("number");
  });
});
