/**
 * POST /api/resume/parse
 *
 * Accepts raw resume text (or base64-encoded file content) and returns a
 * structured JSON representation parsed by Claude Haiku.
 *
 * Body: { text: string; jobType?: string; fileBase64?: string; mimeType?: string }
 * Response: ParsedResume
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedContact {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export interface ParsedExperience {
  title: string;
  company: string;
  period: string;
  bullets: string[];
}

export interface ParsedEducation {
  degree: string;
  school: string;
  year: string;
}

export interface ParsedResume {
  contact: ParsedContact;
  summary: string;
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  certifications: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

const SYSTEM_PROMPT = `You are a resume parser. Extract structured data from the resume and return ONLY valid JSON matching this exact schema:
{
  "contact": { "name": string, "email": string, "phone": string, "location": string },
  "summary": string,
  "experience": [{ "title": string, "company": string, "period": string, "bullets": string[] }],
  "education": [{ "degree": string, "school": string, "year": string }],
  "skills": string[],
  "certifications": string[]
}

Rules:
- Use empty string "" for missing contact fields, empty array [] for missing lists
- For experience bullets, extract key achievements/responsibilities (3-6 per role)
- Skills should be individual items (not sentences)
- Certifications is a flat string array: ["AWS Certified Solutions Architect", ...]
- Return ONLY the JSON object, no markdown, no explanation`;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await makeSupabaseServer();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      fileBase64?: string;
      mimeType?: string;
    };

    const { text, fileBase64, mimeType } = body;

    if (!text && !fileBase64) {
      return NextResponse.json(
        { error: "Either 'text' or 'fileBase64' is required" },
        { status: 400 }
      );
    }

    // 3. Call Claude Haiku
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    type ContentBlock =
      | Anthropic.Messages.TextBlockParam
      | Anthropic.Messages.DocumentBlockParam;

    const userContent: ContentBlock[] = [];

    if (fileBase64 && mimeType === "application/pdf") {
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: fileBase64,
        },
      } as Anthropic.Messages.DocumentBlockParam);
      userContent.push({
        type: "text",
        text: "Parse this resume into the required JSON structure.",
      });
    } else {
      const resumeText = text ?? "";
      if (resumeText.trim().length < 20) {
        return NextResponse.json(
          { error: "Resume text is too short to parse" },
          { status: 400 }
        );
      }
      userContent.push({
        type: "text",
        text: `Parse this resume:\n\n${resumeText}`,
      });
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    // Strip possible markdown code fences
    const jsonStr = raw.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: ParsedResume;
    try {
      parsed = JSON.parse(jsonStr) as ParsedResume;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Ensure required shape
    parsed.contact = parsed.contact ?? { name: "", email: "", phone: "", location: "" };
    parsed.summary = parsed.summary ?? "";
    parsed.experience = Array.isArray(parsed.experience) ? parsed.experience : [];
    parsed.education = Array.isArray(parsed.education) ? parsed.education : [];
    parsed.skills = Array.isArray(parsed.skills) ? parsed.skills : [];
    parsed.certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[resume/parse] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
