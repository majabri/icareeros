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
import type { ParsedResume } from "@/lib/parseResumeLocally";
import type { AiCascadeResult } from "../resumeService";

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
  mockFetch.mockReset();
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
    // extract-text — first fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "raw-extracted-text" }),
    });
    // parse-ai cascade — second fetch; return _source: "none" so the
    // cascade is a no-op and the regex baseline is returned unchanged.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _source: "none" }),
    });

    const file = new File(["fake content"], "resume.pdf", { type: "application/pdf" });
    const { rawText } = await parseResumeFile(file);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
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

// ── parseResumeFile (orphaned tests, repaired) ───────────────────────────────
// HEAD 01fcff6 had test bodies between two `describe` blocks at module top
// level — oxc parser rejected the file. Wrap the bare body in `it(...)`
// per COWORK-BRIEF-phase0-p0-bugs-v1, and re-host the recovered `it(...)`
// blocks inside a fresh `describe(...)` so the file parses again.

describe("parseResumeFile (recovered)", () => {
  it("calls /api/resume/extract-text first, then /api/resume/parse-ai on success", async () => {
    // Current implementation order: extract-text first, parse-ai cascade
    // second. Title and URL updated from the orphan-body original
    // ("/api/resume/parse" + reversed order) which targeted an earlier
    // architecture that no longer exists.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "raw-extracted-text" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _source: "gemini",
        contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "", headline: "" },
        // Longer than the baseline summary (parseResumeLocally mock returns
        // text.slice(0, 40) = "raw-extracted-text"). mergeAiIntoBaseline picks
        // the longer of the two, so AI wins here.
        summary: "ai-summary-from-the-gemini-cascade",
        experience: [],
        education: [],
        skills: [],
        certifications: [],
      }),
    });

    const file = new File(["fake content"], "resume.pdf", { type: "application/pdf" });
    const { parsed, rawText } = await parseResumeFile(file);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const calledUrls = mockFetch.mock.calls.map(c => c[0]);
    expect(calledUrls).toEqual(["/api/resume/extract-text", "/api/resume/parse-ai"]);
    expect(rawText).toBe("raw-extracted-text");
    expect(parsed.summary).toBe("ai-summary-from-the-gemini-cascade");
  });

  it("falls back to local parser when AI parse fails but extract-text succeeds", async () => {
    // extract-text — succeeds (called FIRST in current impl)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ text: "fallback-text" }) });
    // parse-ai — fails (called SECOND); tryAiCascade catches and returns null,
    // so parseResumeFile returns the regex baseline parsed from rawText.
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    const { parsed, rawText } = await parseResumeFile(file);

    const { parseResumeLocally } = await import("@/lib/parseResumeLocally");
    expect(parseResumeLocally).toHaveBeenCalledWith("fallback-text");
    expect(rawText).toBe("fallback-text");
    expect(parsed.contact.name).toBe("Jane Doe"); // local-parser mock response
  });

  it("throws when extract-text itself fails (raw text is required)", async () => {
    // extract-text — fails first; parseResumeFile throws before reaching parse-ai.
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

// ── mergeAiIntoBaseline / findBaselineBullets ────────────────────────────────
// Per-job bullet merge — Phase 0 P0 verification (COWORK-BRIEF-phase0-p0-bugs-v1).
// AI bullets win when present; baseline (regex) bullets fall back per-job when
// AI returned [] for that job; fuzzy company match must catch Abbott vs
// "Abbott Laboratories"; no baseline match → empty stays empty.

const { mergeAiIntoBaseline, findBaselineBullets } = await import("../resumeService");

function emptyContact() {
  return { name: "", email: "", phone: "", location: "", linkedin: "" };
}

function aiContact() {
  return {
    name: "", email: "", phone: "", location: "",
    linkedin: "", github: "", portfolio: "", headline: "",
  };
}

function makeBaseline(overrides: Partial<ParsedResume> = {}): ParsedResume {
  return {
    contact: emptyContact(),
    summary: "",
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    achievements: [],
    ...overrides,
  } as ParsedResume;
}

function makeAi(overrides: Partial<AiCascadeResult> = {}): AiCascadeResult {
  return {
    _source: "gemini",
    contact: aiContact(),
    summary: "",
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    ...overrides,
  };
}

describe("findBaselineBullets (fuzzy company match)", () => {
  const baseline = makeBaseline({
    experience: [
      { title: "PM",     company: "Abbott Laboratories",      period: "", bullets: ["led launch", "owned roadmap"], description: "" } as any,
      { title: "Eng",    company: "Marvell Semiconductors, Inc.", period: "", bullets: ["chip bring-up"],            description: "" } as any,
      { title: "Intern", company: "Acme",                     period: "", bullets: [],                                description: "" } as any,
    ],
  });

  it("matches when AI company is a substring of baseline company (Abbott Laboratories case)", () => {
    expect(findBaselineBullets(baseline, "Abbott")).toEqual(["led launch", "owned roadmap"]);
  });

  it("matches when baseline company has punctuation differences", () => {
    expect(findBaselineBullets(baseline, "Marvell Semiconductors")).toEqual(["chip bring-up"]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(findBaselineBullets(baseline, "  ABBOTT laboratories  ")).toEqual(["led launch", "owned roadmap"]);
  });

  it("returns [] when the matching baseline entry itself has no bullets", () => {
    expect(findBaselineBullets(baseline, "Acme")).toEqual([]);
  });

  it("returns [] when no baseline entry matches", () => {
    expect(findBaselineBullets(baseline, "Initech")).toEqual([]);
  });

  it("returns [] for an empty AI company name", () => {
    expect(findBaselineBullets(baseline, "")).toEqual([]);
  });
});

describe("mergeAiIntoBaseline — per-job bullet merge", () => {
  it("uses AI bullets when AI returned non-empty bullets for that job", () => {
    const baseline = makeBaseline({
      experience: [
        { title: "PM", company: "Abbott Laboratories", period: "", bullets: ["regex-bullet"], description: "" } as any,
      ],
    });
    const ai = makeAi({
      experience: [
        {
          title: "Senior PM", company: "Abbott Laboratories", location: "",
          period: "2020-2024", start_date: "2020", end_date: "2024",
          bullets: ["ai-bullet-1", "ai-bullet-2"], technologies: [],
        },
      ],
    });
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged.experience).toHaveLength(1);
    expect(merged.experience[0].bullets).toEqual(["ai-bullet-1", "ai-bullet-2"]);
    expect(merged.experience[0].description).toBe("ai-bullet-1\nai-bullet-2");
  });

  it("falls back to baseline bullets for the empty-bullets job AND keeps AI bullets for the non-empty job", () => {
    // Exact failure mode from the brief: Gemini returns 7 jobs, 2 of them have
    // bullets: []. The fix must NOT overwrite those 2 with empty arrays.
    const baseline = makeBaseline({
      experience: [
        { title: "PM",  company: "Abbott Laboratories",    period: "", bullets: ["regex-abbott-1", "regex-abbott-2"], description: "" } as any,
        { title: "Eng", company: "Marvell Semiconductors", period: "", bullets: ["regex-marvell-1"],                  description: "" } as any,
      ],
    });
    const ai = makeAi({
      experience: [
        {
          // AI returned this job with empty bullets — should pick up regex
          // bullets via fuzzy match against "Abbott Laboratories".
          title: "Senior PM", company: "Abbott", location: "",
          period: "2020-2024", start_date: "2020", end_date: "2024",
          bullets: [], technologies: [],
        },
        {
          // AI returned this job WITH bullets — should be preserved as-is.
          title: "Staff Eng", company: "Marvell Semiconductors", location: "",
          period: "2018-2020", start_date: "2018", end_date: "2020",
          bullets: ["ai-marvell-1", "ai-marvell-2"], technologies: [],
        },
      ],
    });
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged.experience).toHaveLength(2);
    expect(merged.experience[0].bullets).toEqual(["regex-abbott-1", "regex-abbott-2"]);
    expect(merged.experience[1].bullets).toEqual(["ai-marvell-1", "ai-marvell-2"]);
  });

  it("leaves bullets [] when AI returned [] AND baseline has no matching company", () => {
    const baseline = makeBaseline({
      experience: [
        { title: "PM", company: "Abbott Laboratories", period: "", bullets: ["regex-abbott"], description: "" } as any,
      ],
    });
    const ai = makeAi({
      experience: [
        {
          title: "Eng", company: "Initech", location: "",
          period: "2020-2024", start_date: "2020", end_date: "2024",
          bullets: [], technologies: [],
        },
      ],
    });
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged.experience).toHaveLength(1);
    expect(merged.experience[0].bullets).toEqual([]);
    expect(merged.experience[0].description).toBe("");
  });

  it("uses baseline.experience entirely when AI returns no experience entries", () => {
    const baselineExp = [
      { title: "PM", company: "Abbott Laboratories", period: "", bullets: ["b1"], description: "" } as any,
    ];
    const baseline = makeBaseline({ experience: baselineExp });
    const ai = makeAi({ experience: [] });
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged.experience).toEqual(baselineExp);
  });
});
