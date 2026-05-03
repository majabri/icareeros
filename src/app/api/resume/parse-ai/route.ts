/**
 * POST /api/resume/parse-ai
 *
 * Cascade for structured resume extraction (each tier returns null if its
 * env var is missing or the upstream errors — falls through to the next):
 *
 *   1. Anthropic Claude Haiku 4.5 (preferred — most reliable, ANTHROPIC_API_KEY)
 *   2. Lovable Gateway            (paid via Lovable subscription)
 *   3. Gemini 2.0 Flash           (Google AI Studio free tier)
 *   4. (caller's regex/heuristic auto-fill stays as last-resort if all fail)
 *
 * All three upstreams are called with the SAME tool-use schema so the
 * downstream consumer always receives an `extract_resume` tool result.
 *
 * Env vars (any subset OK — missing keys gracefully skip that tier):
 *   - ANTHROPIC_API_KEY — from https://console.anthropic.com/
 *   - LOVABLE_API_KEY   — from your Lovable dashboard (paid plan)
 *   - GEMINI_API_KEY    — from https://aistudio.google.com/app/apikey
 *
 * Input: JSON { text: string }
 * Output: ParsedResume (same shape as the legacy /api/resume/parse) plus a
 *         `_source` field telling the client which tier answered.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { createTracedClient } from "@/lib/observability/langfuse";

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
  _source: "anthropic" | "lovable" | "gemini" | "none";
}

// ── Tool schema (shared between Lovable and Gemini) ───────────────────────────
// OpenAI-compatible JSON schema — Lovable Gateway speaks Chat Completions and
// Gemini's generateContent has an equivalent function-calling shape we map to.

const EXTRACT_TOOL = {
  name: "extract_resume",
  description:
    "Extract ALL structured resume data into the schema. Be exhaustive — preserve numbers verbatim, do not summarize bullets, do not skip fields.",
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
        items: {
          type: "object",
          properties: {
            title:        { type: "string" },
            company:      { type: "string" },
            location:     { type: "string" },
            period:       { type: "string" },
            start_date:   { type: "string" },
            end_date:     { type: "string" },
            bullets:      { type: "array", items: { type: "string" } },
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

const SYSTEM_PROMPT =
  "You are an expert resume parser. Call the extract_resume tool to return ALL structured data. " +
  "Be exhaustive — preserve numbers verbatim, do not summarize bullets, extract every distinct piece of information. " +
  "Empty string \"\" or empty array [] for missing fields. You MUST call the tool — do not return prose.";

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

// ── Tier 1: Lovable Gateway (OpenAI Chat Completions shape) ───────────────────

// ── Tier 0: Anthropic Claude (Haiku 4.5) — uses the SDK + createTracedClient
//          pattern that the other API routes use, so any breakage here would
//          surface across the whole app.

async function tryAnthropic(text: string, userId: string): Promise<ParsedResume | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const anthropic = createTracedClient(userId, "resume/parse-ai");
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools: [{
        name:         EXTRACT_TOOL.name,
        description:  EXTRACT_TOOL.description,
        input_schema: EXTRACT_TOOL.parameters as Anthropic.Tool["input_schema"],
      }],
      tool_choice: { type: "tool", name: "extract_resume" },
      messages: [{ role: "user", content: `Parse this resume:\n\n${text}` }],
    });

    const toolUse = res.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "extract_resume",
    );
    if (!toolUse) {
      console.warn("[parse-ai] Anthropic returned no tool_use block");
      return null;
    }
    return { ...normalize(toolUse.input), _source: "anthropic" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[parse-ai] Anthropic threw: ${msg}`);
    return null;
  }
}

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
    return { ...normalize(parsed), _source: "lovable" };
  } catch (err) {
    console.warn("[parse-ai] Lovable threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Tier 2: Gemini 2.0 Flash (Google AI generateContent shape) ────────────────

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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
            function_calling_config: { mode: "ANY", allowed_function_names: ["extract_resume"] },
          },
          generationConfig: { maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "<unreadable>");
      console.warn(`[parse-ai] Gemini returned ${res.status}: ${errBody.slice(0, 800)}`);
      return null;
    }

    const data = await res.json();
    const fnCall = data.candidates?.[0]?.content?.parts?.find(
      (p: unknown) => (p as { functionCall?: unknown }).functionCall
    );
    const args = (fnCall as { functionCall?: { args?: unknown } } | undefined)?.functionCall?.args;
    if (!args) return null;
    return { ...normalize(args), _source: "gemini" };
  } catch (err) {
    console.warn("[parse-ai] Gemini threw:", err instanceof Error ? err.message : err);
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

    // Try cascade — Anthropic first (we know the key works), then Lovable, then Gemini.
    const anthropic = await tryAnthropic(text, user.id);
    if (anthropic) return NextResponse.json(anthropic);

    const lovable = await tryLovable(text);
    if (lovable) return NextResponse.json(lovable);

    const gemini = await tryGemini(text);
    if (gemini) return NextResponse.json(gemini);

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
