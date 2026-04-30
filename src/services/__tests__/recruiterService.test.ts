import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyseJobDescription } from "../recruiterService";

const mockAnalysis = {
  ideal_candidate: "Experienced software engineer with 5+ years of React.",
  must_have_skills: ["React", "TypeScript"],
  nice_to_have_skills: ["GraphQL"],
  screening_questions: [
    { question: "Tell me about a complex React project.", what_to_listen_for: "Depth of experience." },
  ],
  red_flags: ["Job hopping every 6 months"],
  compensation_notes: "$120k–$150k market rate",
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => vi.clearAllMocks());

describe("analyseJobDescription", () => {
  it("returns analysis on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ analysis: mockAnalysis }),
    });
    const result = await analyseJobDescription("We are looking for a senior React engineer with 5+ years of experience building large-scale web applications.");
    expect(result.analysis).toEqual(mockAnalysis);
    expect(result.error).toBeUndefined();
  });

  it("passes company_name in request body", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ analysis: mockAnalysis }) });
    await analyseJobDescription("We are looking for a senior React engineer with 5+ years of experience building large-scale web applications.", "Acme Corp");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.company_name).toBe("Acme Corp");
  });

  it("returns error when API responds with error status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    });
    const result = await analyseJobDescription("Some job description that is long enough to pass validation.");
    expect(result.error).toBe("Unauthorized");
    expect(result.analysis).toBeUndefined();
  });

  it("returns network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));
    const result = await analyseJobDescription("Some job description that is long enough to pass validation.");
    expect(result.error).toBe("Network error");
  });

  it("POSTs to /api/recruiter", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ analysis: mockAnalysis }) });
    await analyseJobDescription("Some job description that is long enough to pass validation.");
    expect(mockFetch).toHaveBeenCalledWith("/api/recruiter", expect.objectContaining({ method: "POST" }));
  });
});
