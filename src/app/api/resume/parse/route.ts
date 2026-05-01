/**
 * POST /api/resume/parse
 *
 * Accepts three input modes:
 *   1. JSON  { text: string }                           → raw text paste
 *   2. JSON  { fileBase64: string, mimeType: string }   → PDF (legacy, kept for compat)
 *   3. FormData { file: File }                          → PDF | DOCX | DOC | TXT
 *
 * Word (.docx / .doc) is extracted server-side via mammoth.
 * PDF is sent directly to Claude as a native document block.
 * All other files are read as UTF-8 text.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { createTracedClient } from "@/lib/observability/langfuse";
import mammoth from "mammoth";

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
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}

/** True if the file looks like a Word document */
function isWordFile(mimeType: string, fileName: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    fileName.toLowerCase().endsWith(".docx") ||
    fileName.toLowerCase().endsWith(".doc")
  );
}

/** True if the file is a PDF */
function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
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
    // 1. Auth
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const anthropic = createTracedClient(user.id, "resume/parse");
    type ContentBlock = Anthropic.Messages.TextBlockParam | Anthropic.Messages.DocumentBlockParam;
    const userContent: ContentBlock[] = [];

    const contentType = req.headers.get("content-type") ?? "";

    // ── Path A: FormData file upload (PDF | DOCX | DOC | TXT) ─────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (isPdfFile(file.type, file.name)) {
        // Send PDF natively to Claude
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
        } as Anthropic.Messages.DocumentBlockParam);
        userContent.push({ type: "text", text: "Parse this resume into the required JSON structure." });

      } else if (isWordFile(file.type, file.name)) {
        // Extract text from Word doc using mammoth
        const { value: extractedText, messages: warnings } = await mammoth.extractRawText({ buffer });
        if (warnings.length > 0) {
          console.warn("[resume/parse] mammoth warnings:", warnings.map(w => w.message).join("; "));
        }
        if (!extractedText.trim()) {
          return NextResponse.json({ error: "Could not extract text from Word document. Try saving as PDF or pasting the text." }, { status: 422 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${extractedText}` });

      } else {
        // Plain text / other
        const text = buffer.toString("utf-8");
        if (text.trim().length < 20) {
          return NextResponse.json({ error: "File appears to be empty or too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${text}` });
      }

    // ── Path B: JSON body (text paste or legacy PDF base64) ──────────────
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        text?: string;
        fileBase64?: string;
        mimeType?: string;
      };

      if (body.fileBase64 && body.mimeType === "application/pdf") {
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 },
        } as Anthropic.Messages.DocumentBlockParam);
        userContent.push({ type: "text", text: "Parse this resume into the required JSON structure." });

      } else if (body.text) {
        if (body.text.trim().length < 20) {
          return NextResponse.json({ error: "Resume text is too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${body.text}` });

      } else {
        return NextResponse.json({ error: "Provide 'text', 'fileBase64', or upload a file." }, { status: 400 });
      }
    }

    // 3. Call Claude Haiku
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response type from Claude");

    const jsonStr = raw.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: ParsedResume;
    try {
      parsed = JSON.parse(jsonStr) as ParsedResume;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Normalise shape
    parsed.contact      = parsed.contact      ?? { name: "", email: "", phone: "", location: "" };
    parsed.summary      = parsed.summary      ?? "";
    parsed.experience   = Array.isArray(parsed.experience)   ? parsed.experience   : [];
    parsed.education    = Array.isArray(parsed.education)    ? parsed.education    : [];
    parsed.skills       = Array.isArray(parsed.skills)       ? parsed.skills       : [];
    parsed.certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];

    return NextResponse.json(parsed);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[resume/parse] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
