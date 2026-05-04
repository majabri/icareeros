/**
 * POST /api/resume/parse-ai
 *
 * Two-tier cascade for structured resume extraction:
 *
 *   1. Gemini 2.5 Flash  (preferred — Google AI Studio free tier, generous quota)
 *   2. Lovable Gateway   (fallback — only if LOVABLE_API_KEY is present)
 *   3. (caller's regex/heuristic auto-fill stays as last-resort if both fail)
 *
 * Both upstreams are called with the SAME function-calling shape so the
 * downstream consumer always receives an `extract_resume` tool result.
 *
 * Env vars (any subset OK — missing keys gracefully skip that tier):
 *   - GEMINI_API_KEY   — from https://aistudio.google.com/app/apikey
 *   - LOVABLE_API_KEY  — from your Lovable dashboard (optional)
 *
 * Input: JSON { text: string }
 * Output: ParsedResume (same shape as the legacy /api/resume/parse) plus a
 *         `_source` field telling the client which tier answered.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// ── Output shape (must stay compatible with the intake form's setValue path) ──

interface ParsedResume {
  contact: {
    name: string; email: string; phone: string; location: string;
    linkedin: string; github: string; portfolio: string; headline: string;
  };
  summary: string;
  experience: Array<{
    title: string; company: string; location: string;
    period: string; start_date: string; end_date: string;
    bullets: string[]; technologies: string[];
  }>;
  education: Array<{
    degree: string; field_of_study: string; school: string;
    location: string; year: string; gpa: string; honors: string;
  }>;
  skills: string[];
  certifications: string[];
  _source: "lovable" | "gemini" | "none";
}

// ── Tool schema (shared between Lovable and Gemini) ───────────────────────────
// OpenAI-compatible JSON schema — Lovable Gateway speaks Chat Completions and
// Gemini's generateContent has an equivalent function-calling shape we map to.

const EXTRACT_TOOL = {
  name: "extract_resume",
  description:
    "Extract ALL structured resume data into the schema. Be exhaustive — preserve numbers verbatim, extract every job's bullets (even when there are no bullet markers), do not summarize, do not skip fields.",
  parameters: {
    type: "object",
    properties: {
      contact: {
        type: "object",
        properties: {
          name:      { type: "string" },
          email:     { type: "string" },
          phone:     { type: "string" },
          location:  { type: "string" },
          linkedin:  { type: "string" },
          github:    { type: "string" },
          portfolio: { type: "string" },
          headline:  { type: "string" },
        },
        required: ["name","email","phone","location","linkedin","github","portfolio","headline"],
      },
      summary: { type: "string" },
      experience: {
        type: "array",
        description: "EVERY job/role/position the candidate has held. Each item must include its bullets (responsibilities/achievements). Bullets are the lines between the date and the next job header — they often have NO leading marker, just plain sentences separated by blank lines. Extract them ALL.",
        items: {
          type: "object",
          properties: {
            title:        { type: "string" },
            company:      { type: "string" },
            location:     { type: "string" },
            period:       { type: "string" },
            start_date:   { type: "string" },
            end_date:     { type: "string" },
            bullets:      {
              type: "array",
              items: { type: "string" },
              description: "REQUIRED: every distinct line of responsibilities, achievements, or duties listed under this job. Lines may not have bullet markers (•/-/*) — they are still bullets if they appear between the date range and the next job header. NEVER return [] when there are description lines visible in the source. Preserve verbatim wording.",
            },
            technologies: { type: "array", items: { type: "string" } },
          },
          required: ["title","company","location","period","start_date","end_date","bullets","technologies"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree:         { type: "string" },
            field_of_study: { type: "string" },
            school:         { type: "string" },
            location:       { type: "string" },
            year:           { type: "string" },
            gpa:            { type: "string" },
            honors:         { type: "string" },
          },
          required: ["degree","field_of_study","school","location","year","gpa","honors"],
        },
      },
      skills:         { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
    },
    required: ["contact","summary","experience","education","skills","certifications"],
  },
};

const SYSTEM_PROMPT = [
  "You are an expert resume parser. Call the extract_resume tool to return ALL structured data.",
  "",
  "WORK EXPERIENCE — bullets must be extracted for EVERY job entry, not just some.",
  "  • A job's bullets are the description lines that appear between the role's date range and the NEXT job's company name.",
  "  • Bullets MAY have leading markers (•, -, *, ·, 1., a)) but often have NONE — plain sentences separated by blank lines or single line breaks are still bullets.",
  "  • If you see ANY descriptive lines under a job header in the source, include them in that job's bullets array verbatim. Never drop them just because the formatting is unusual.",
  "  • Empty bullets[] is ONLY correct when the source truly contains no description for that job (e.g., the job is just a one-line entry with title/company/dates and nothing else).",
  "  • Before finalizing, double-check every job: if its bullets array is empty, scan the source again for that job's section — chances are you missed lines.",
  "",
  "OTHER FIELDS — preserve numbers verbatim, do not summarize. Empty string \"\" or empty array [] for missing fields.",
  "",
  "You MUST call the extract_resume tool. Do not return prose.",
].join("\n");

// ── Auth helper ───────────────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}

// ── Backfill helper: fix empty bullets[] from raw text ────────────────────────
// Even with a strict prompt, Gemini occasionally returns bullets:[] for a job
// when the source DID contain description lines (observed for Abbott Laboratories
// and MARVELL SEMICONDUCTORS in Samir Jabri's resume). This deterministic fallback
// scans the raw text for each empty-bullet job's section and extracts the
// description lines between that company's header and the next company header.
//
// Heuristic: a "company header" is a line that has 1-6 words, mostly uppercase
// or title-case, and matches the company string from the AI result (case-insensitive
// substring or fuzzy match). Description lines are non-header lines between the
// company header and the next company header that are at least 12 chars long
// and don't look like a date range or job title.

function looksLikeDateRange(line: string): boolean {
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|present)\b/i.test(line)
      || /\b(19|20)\d{2}\b/.test(line)
      || /^\s*\d{1,2}\s*\/\s*\d{1,2}/.test(line);
}

function backfillEmptyBullets(parsed: ParsedResume, rawText: string): ParsedResume {
  if (!Array.isArray(parsed.experience) || parsed.experience.length === 0) return parsed;

  // Find the index in rawText where each company's section starts.
  const lines = rawText.split(/\r?\n/);
  const lowerLines = lines.map(l => l.trim().toLowerCase());

  const companyIndexes: Array<{ idx: number; exp_index: number }> = [];
  parsed.experience.forEach((exp, expIdx) => {
    const companyKey = (exp.company ?? "").trim().toLowerCase();
    if (!companyKey) return;
    // Find the first line that is mostly the company name (allowing slight diffs).
    const found = lowerLines.findIndex((l, i) => {
      if (companyIndexes.some(ci => ci.idx === i)) return false; // already used
      if (l === companyKey) return true;
      // Also accept the line if it CONTAINS the company key as a whole token segment
      // and the line is not too long (avoid matching a paragraph mentioning the company).
      if (l.length < companyKey.length + 30 && l.includes(companyKey)) return true;
      return false;
    });
    if (found >= 0) companyIndexes.push({ idx: found, exp_index: expIdx });
  });

  // Sort by source-text position so we can compute each section's range.
  companyIndexes.sort((a, b) => a.idx - b.idx);

  for (let ci = 0; ci < companyIndexes.length; ci++) {
    const { idx, exp_index } = companyIndexes[ci];
    const exp = parsed.experience[exp_index];
    if (Array.isArray(exp.bullets) && exp.bullets.length > 0) continue; // already has bullets

    const endIdx = ci + 1 < companyIndexes.length ? companyIndexes[ci + 1].idx : lines.length;

    // Collect candidate description lines.
    const titleKey = (exp.title ?? "").trim().toLowerCase();
    const candidates: string[] = [];
    for (let i = idx + 1; i < endIdx; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      if (raw.length < 12) continue;                  // too short, likely a heading
      if (looksLikeDateRange(raw)) continue;          // date line
      if (raw.toLowerCase() === titleKey) continue;   // job title repeat
      // Skip section markers like "EDUCATION", "SKILLS", etc. — short uppercase headers
      if (raw.length < 40 && raw === raw.toUpperCase()) continue;
      candidates.push(raw);
    }

    if (candidates.length > 0) {
      parsed.experience[exp_index] = { ...exp, bullets: candidates };
      console.log(`[parse-ai] backfill: filled ${candidates.length} bullets for "${exp.company}"`);
    }
  }

  return parsed;
}

// ── Tier 1: Gemini 2.5 Flash (Google AI generateContent shape) ────────────────

async function tryGemini(text: string): Promise<ParsedResume | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    // Gemini's function declaration syntax — slightly different from OpenAI
    const geminiTool = {
      function_declarations: [{
        name:        EXTRACT_TOOL.name,
        description: EXTRACT_TOOL.description,
        parameters:  EXTRACT_TOOL.parameters,
      }],
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            { role: "user", parts: [{ text: `Parse this resume:\n\n${text}` }] },
          ],
          tools: [geminiTool],
          tool_config: {
            function_calling_config: { mode: "ANY" },
          },
          generationConfig: { maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "<unreadable>");
      console.warn(`[parse-ai] Gemini (gemini-2.5-flash) returned ${res.status}: ${errBody.slice(0, 800)}`);
      return null;
    }

    const data = await res.json();
    const fnCall = data.candidates?.[0]?.content?.parts?.find(
      (p: unknown) => (p as { functionCall?: unknown }).functionCall
    );
    const args = (fnCall as { functionCall?: { args?: unknown } } | undefined)?.functionCall?.args;
    if (!args) return null;
    return { ...backfillEmptyBullets(normalize(args), text), _source: "gemini" };
  } catch (err) {
    console.warn("[parse-ai] Gemini threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Tier 2: Lovable Gateway (OpenAI Chat Completions shape) ───────────────────

async function tryLovable(text: string): Promise<ParsedResume | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", // Lovable maps this to upstream Claude
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `Parse this resume:\n\n${text}` },
        ],
        tools: [{ type: "function", function: EXTRACT_TOOL }],
        tool_choice: { type: "function", function: { name: "extract_resume" } },
        max_tokens: 8192,
      }),
      // 30s timeout
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[parse-ai] Lovable returned ${res.status}, falling through to Gemini`);
      return null;
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;
    const parsed = JSON.parse(toolCall.function.arguments);
    return { ...backfillEmptyBullets(normalize(parsed), text), _source: "lovable" };
  } catch (err) {
    console.warn("[parse-ai] Lovable threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Normalization (defensive — both providers can occasionally return partials)

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => asStr(x)).filter(Boolean) : [];
}
function asObjArr<T>(v: unknown, mapper: (o: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(item => mapper((item ?? {}) as Record<string, unknown>));
}

function normalize(raw: unknown): Omit<ParsedResume, "_source"> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const c = (o.contact ?? {}) as Record<string, unknown>;
  return {
    contact: {
      name:      asStr(c.name),
      email:     asStr(c.email),
      phone:     asStr(c.phone),
      location:  asStr(c.location),
      linkedin:  asStr(c.linkedin),
      github:    asStr(c.github),
      portfolio: asStr(c.portfolio),
      headline:  asStr(c.headline),
    },
    summary: asStr(o.summary),
    experience: asObjArr(o.experience, (e) => ({
      title:        asStr(e.title),
      company:      asStr(e.company),
      location:     asStr(e.location),
      period:       asStr(e.period),
      start_date:   asStr(e.start_date),
      end_date:     asStr(e.end_date),
      bullets:      asStrArr(e.bullets),
      technologies: asStrArr(e.technologies),
    })),
    education: asObjArr(o.education, (e) => ({
      degree:         asStr(e.degree),
      field_of_study: asStr(e.field_of_study),
      school:         asStr(e.school),
      location:       asStr(e.location),
      year:           asStr(e.year),
      gpa:            asStr(e.gpa),
      honors:         asStr(e.honors),
    })),
    skills:         asStrArr(o.skills),
    certifications: asStrArr(o.certifications),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth — same pattern as the rest of the API surface
    const supabase = await makeSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text || text.length < 20) {
      return NextResponse.json({ error: "Resume text is too short to parse." }, { status: 400 });
    }

    // Try cascade — Gemini first (free Google AI, primary tier), then Lovable (skipped without LOVABLE_API_KEY).
    const gemini = await tryGemini(text);
    if (gemini) return NextResponse.json(gemini);

    const lovable = await tryLovable(text);
    if (lovable) return NextResponse.json(lovable);

    // Both tiers unavailable / failed — return _source: "none" so the client
    // falls back to its local heuristic auto-fill.
    return NextResponse.json({
      _source: "none",
      contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "", headline: "" },
      summary: "",
      experience: [],
      education: [],
      skills: [],
      certifications: [],
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[parse-ai] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
