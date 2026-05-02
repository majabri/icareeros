/**
 * resumeService unit tests
 *
 * parseResumeText: synchronous — calls parseResumeLocally, no fetch.
 * parseResumeFile: async — calls /api/resume/extract-text then parseResumeLocally.
 * rewriteResume:   async — calls /api/resume/rewrite (Claude Sonnet, plan-gated).
 * CRUD:            saveResumeVersion / listResumeVersions / deleteResumeVersion.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResumeVersion } from "../resumeService";

// ── Mock parseResumeLocally ───────────────────────────────────────────────────

vi.mock("@/lib/parseResumeLocally", () => ({
  parseResumeLocally: vi.fn((text: string) => ({
    contact: { name: "Jane Doe", email: "jane@example.com", phone: "", location: "", linkedin: "" },
    summary: text.slice(0, 40),
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    achievements: [],
  })),
}));

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock Supabase ─────────────────────────────────────────────────────────────

const mockSingle = vi.fn();
const mockOrder = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockReturnThis();
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

// ── Import after mocks ────────────────────────────────────────────────────────

const {
  parseResumeText,
  parseResumeFile,
  saveResumeVersion,
  listResumeVersions,
  deleteResumeVersion,
  rewriteResume,
} = await import("../resumeService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_VERSION: ResumeVersion = {
  id: "rv-001",
  user_id: "u-001",
  version_name: "Senior Engineer v1",
  job_type: "fulltime",
  resume_text: "Jane Doe | Senior Engineer",
  parsed_data: null,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, delete: mockDelete, eq: mockEq, order: mockOrder, single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect, single: mockSingle });
  mockSelect.mockReturnValue({ order: mockOrder, single: mockSingle, eq: mockEq });
  mockOrder.mockResolvedValue({ data: [SAMPLE_VERSION], error: null });
  mockSingle.mockResolvedValue({ data: SAMPLE_VERSION, error: null });
  mockEq.mockResolvedValue({ error: null });
});

// ── parseResumeText ───────────────────────────────────────────────────────────

describe("parseResumeText", () => {
  it("returns a ParsedResume without making any fetch calls", () => {
    const result = parseResumeText("Jane Doe\nSenior Engineer\nTypeScript, Node.js");
    expect(result).toHaveProperty("contact");
    expect(result).toHaveProperty("skills");
    expect(result).toHaveProperty("achievements");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("passes raw text to parseResumeLocally", async () => {
    const { parseResumeLocally } = await import("@/lib/parseResumeLocally");
    parseResumeText("hello world");
    expect(parseResumeLocally).toHaveBeenCalledWith("hello world");
  });
});

// ── parseResumeFile ───────────────────────────────────────────────────────────

describe("parseResumeFile", () => {
  it("calls /api/resume/extract-text with a FormData body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "raw-extracted-text" }),
    });

    const file = new File(["fake content"], "resume.pdf", { type: "application/pdf" });
    const { rawText } = await parseResumeFile(file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/resume/extract-text",
      expect.objectContaining({ method: "POST" })
    );
    expect(rawText).toBe("raw-extracted-text");
  });

  it("calls parseResumeLocally on the extracted text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "fallback-text" }),
    });
    const { parseResumeLocally } = await import("@/lib/parseResumeLocally");

    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    const { parsed } = await parseResumeFile(file);

    expect(parseResumeLocally).toHaveBeenCalledWith("fallback-text");
    expect(parsed.contact.name).toBe("Jane Doe");
  });

  it("throws when extract-text fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });

    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    await expect(parseResumeFile(file)).rejects.toThrow(/Text extraction failed|boom/);
  });

  it("rejects files larger than 10 MB before any fetch", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await expect(parseResumeFile(big)).rejects.toThrow(/File too large/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

    const file = new File(["fake content"], "resume.pdf", { type: "application/pdf" });
    const { parsed, rawText } = await parseResumeFile(file);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const calledUrls = mockFetch.mock.calls.map(c => c[0]);
    expect(calledUrls).toContain("/api/resume/parse");
    expect(calledUrls).toContain("/api/resume/extract-text");
    expect(rawText).toBe("raw-extracted-text");
    expect(parsed.summary).toBe("ai-summary");
  });

  it("falls back to local parser when AI parse fails but extract-text succeeds", async () => {
    // AI parse — fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    // extract-text — succeeds
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ text: "fallback-text" }) });

    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    const { parsed, rawText } = await parseResumeFile(file);

    const { parseResumeLocally } = await import("@/lib/parseResumeLocally");
    expect(parseResumeLocally).toHaveBeenCalledWith("fallback-text");
    expect(rawText).toBe("fallback-text");
    expect(parsed.contact.name).toBe("Jane Doe"); // local-parser mock response
  });

  it("throws when extract-text itself fails (raw text is required)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }); // parse
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) }); // extract-text

    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    await expect(parseResumeFile(file)).rejects.toThrow(/Text extraction failed/);
  });

  it("rejects files larger than 10 MB before any fetch", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await expect(parseResumeFile(big)).rejects.toThrow(/File too large/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── rewriteResume ─────────────────────────────────────────────────────────────

describe("rewriteResume", () => {
  it("calls /api/resume/rewrite with the correct body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rewrittenText: "Improved text", improvements: ["Better tone"], wordCount: 250 }),
    });

    const result = await rewriteResume({ resumeText: "Original resume text for testing purposes here" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/resume/rewrite",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("resumeText"),
      })
    );
    expect(result.rewrittenText).toBe("Improved text");
    expect(result.wordCount).toBe(250);
  });

  it("passes targetRole and jobDescription when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rewrittenText: "Tailored text", improvements: [], wordCount: 300 }),
    });

    await rewriteResume({
      resumeText: "Some resume content for the rewrite test",
      targetRole: "Staff Engineer",
      jobDescription: "Build distributed systems",
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.targetRole).toBe("Staff Engineer");
    expect(body.jobDescription).toBe("Build distributed systems");
  });

  it("throws if API returns an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: "plan_limit_exceeded" }),
    });

    await expect(rewriteResume({ resumeText: "Some text to rewrite here" })).rejects.toThrow("plan_limit_exceeded");
  });
});

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

describe("saveResumeVersion", () => {
  it("inserts a row and returns the version", async () => {
    const result = await saveResumeVersion({
      versionName: "v1",
      resumeText: "Jane Doe resume text here",
    });
    expect(mockFrom).toHaveBeenCalledWith("resume_versions");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ version_name: "v1" })
    );
    expect(result.id).toBe("rv-001");
  });
});

describe("listResumeVersions", () => {
  it("returns an array of resume versions ordered by created_at desc", async () => {
    const results = await listResumeVersions();
    expect(Array.isArray(results)).toBe(true);
    expect(results[0].version_name).toBe("Senior Engineer v1");
  });
});

describe("deleteResumeVersion", () => {
  it("deletes the resume version by id", async () => {
    await deleteResumeVersion("rv-001");
    expect(mockFrom).toHaveBeenCalledWith("resume_versions");
    expect(mockEq).toHaveBeenCalledWith("id", "rv-001");
  });
});
