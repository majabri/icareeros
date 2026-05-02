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
 *
 * Uses Claude Sonnet for higher-accuracy structured extraction (vs Haiku),
 * and an expanded schema that captures linkedin/github/portfolio, project
 * work, languages with proficiency, awards, publications, volunteer, and
 * separate honors/GPA/field-of-study on education.
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
  linkedin: string;
  github: string;
  portfolio: string;
  headline: string;
}

export interface ParsedExperience {
  title: string;
  company: string;
  location: string;
  period: string;
  start_date: string;
  end_date: string;
  bullets: string[];
  technologies: string[];
}

export interface ParsedEducation {
  degree: string;
  field_of_study: string;
  school: string;
  location: string;
  year: string;
  gpa: string;
  honors: string;
}

export interface ParsedProject {
  title: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface ParsedLanguage {
  name: string;
  proficiency: string;
}

export interface ParsedResume {
  contact: ParsedContact;
  summary: string;
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  certifications: string[];   // formatted as "Name — Issuer (Year)" for back-compat with the profile page consumer + DB schema
  projects: ParsedProject[];
  languages: ParsedLanguage[];
  awards: string[];
  publications: string[];
  volunteer: ParsedExperience[];
  professional_memberships: string[];
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

function isWordFile(mimeType: string, fileName: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    fileName.toLowerCase().endsWith(".docx") ||
    fileName.toLowerCase().endsWith(".doc")
  );
}

function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

const SYSTEM_PROMPT = `You are an expert resume parser. Extract ALL structured data from the resume into the exact JSON schema below. Be exhaustive — do NOT drop information that exists in the resume.

SCHEMA:
{
  "contact": {
    "name": string,
    "email": string,
    "phone": string,
    "location": string,             // city, state/country
    "linkedin": string,             // full URL if present, e.g. "https://linkedin.com/in/jane-doe"
    "github": string,               // full URL
    "portfolio": string,            // personal site / portfolio URL
    "headline": string              // role title or personal tagline shown at top of resume
  },
  "summary": string,                // professional summary / objective paragraph
  "experience": [{
    "title": string,
    "company": string,
    "location": string,             // job location
    "period": string,               // human-readable, e.g. "Jan 2022 – Present"
    "start_date": string,           // YYYY-MM if known, else YYYY, else ""
    "end_date": string,             // YYYY-MM, YYYY, or "Present"
    "bullets": string[],            // ALL bullets from the role — do not truncate; preserve quantified outcomes verbatim
    "technologies": string[]        // tech / tools mentioned in this role's bullets, deduplicated
  }],
  "education": [{
    "degree": string,               // e.g. "Bachelor of Science"
    "field_of_study": string,       // e.g. "Computer Science"
    "school": string,
    "location": string,
    "year": string,                 // graduation year
    "gpa": string,                  // empty if not listed
    "honors": string                // e.g. "Magna Cum Laude", "Dean's List"
  }],
  "skills": string[],               // ALL skills as individual items, deduplicated. Include hard skills, tools, frameworks, methodologies. Do NOT include sentences.
  "certifications": string[],       // each as "Name — Issuer (Year)" if all known, else as much as available. Examples: "AWS Solutions Architect — Amazon (2023)", "PMP — PMI (2021)", "CKA — CNCF". Capture credential ID inline if present: "AWS SAA-C03 — Amazon (2023, ID: ABC123)".
  "projects": [{
    "title": string,
    "description": string,
    "technologies": string[],
    "url": string
  }],
  "languages": [{
    "name": string,                 // e.g. "Spanish"
    "proficiency": string           // e.g. "Native", "Fluent", "Conversational", "Basic"
  }],
  "awards": string[],               // honors, awards, recognitions, scholarships
  "publications": string[],         // papers, articles, books — full citation
  "volunteer": [/* same shape as experience entries */],
  "professional_memberships": string[]  // associations, societies, professional bodies
}

EXTRACTION RULES:
1. Be COMPREHENSIVE — extract every distinct piece of information. Resumes pack a lot into small space; do not skim.
2. For experience bullets: extract EVERY bullet point or sentence describing accomplishments/responsibilities. Preserve numbers and percentages exactly. Do not summarize — copy the original text closely.
3. Skills section: extract every skill listed. Also extract tools/tech/frameworks mentioned in experience bullets and add them to BOTH skills (top level) AND the role's technologies array.
4. If a section doesn't exist in the resume, return an empty array [] or empty string "".
5. Dates: prefer ISO-ish format (YYYY-MM or YYYY). If only year is given, use that. "Present" / "Current" → "Present" in end_date.
6. URLs: include the full URL with https:// when present.
7. Certifications must include the issuer and year if mentioned. Common issuers: AWS, Google, Microsoft, PMI, Scrum.org, Cisco, Coursera, etc.
8. Languages: include proficiency level if specified ("native", "fluent", "intermediate", "basic"). If no level given, use "Stated".
9. Volunteer experience uses the SAME schema as paid experience entries (title/company/location/period/bullets/etc).
10. If unsure whether something is a project or job, prefer "experience" if it had a company/employer, else "projects".

OUTPUT:
Return ONLY the JSON object — no markdown fences, no commentary, no preamble. The first character must be { and the last must be }.`;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const anthropic = createTracedClient(user.id, "resume/parse");
    type ContentBlock = Anthropic.Messages.TextBlockParam | Anthropic.Messages.DocumentBlockParam;
    const userContent: ContentBlock[] = [];

    const contentType = req.headers.get("content-type") ?? "";

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
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
        } as Anthropic.Messages.DocumentBlockParam);
        userContent.push({ type: "text", text: "Parse this resume into the required JSON structure. Be comprehensive — extract every detail." });
      } else if (isWordFile(file.type, file.name)) {
        const { value: extractedText, messages: warnings } = await mammoth.extractRawText({ buffer });
        if (warnings.length > 0) {
          console.warn("[resume/parse] mammoth warnings:", warnings.map(w => w.message).join("; "));
        }
        if (!extractedText.trim()) {
          return NextResponse.json({ error: "Could not extract text from Word document. Try saving as PDF or pasting the text." }, { status: 422 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${extractedText}` });
      } else {
        const text = buffer.toString("utf-8");
        if (text.trim().length < 20) {
          return NextResponse.json({ error: "File appears to be empty or too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${text}` });
      }
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
        userContent.push({ type: "text", text: "Parse this resume into the required JSON structure. Be comprehensive — extract every detail." });
      } else if (body.text) {
        if (body.text.trim().length < 20) {
          return NextResponse.json({ error: "Resume text is too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume:\n\n${body.text}` });
      } else {
        return NextResponse.json({ error: "Provide 'text', 'fileBase64', or upload a file." }, { status: 400 });
      }
    }

    // Sonnet for accuracy on structured extraction (vs Haiku previously).
    // 8192 max_tokens to avoid truncation on long resumes.
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
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

    // Normalise shape — every consumer can rely on every field being present.
    parsed.contact = {
      name:      parsed.contact?.name      ?? "",
      email:     parsed.contact?.email     ?? "",
      phone:     parsed.contact?.phone     ?? "",
      location:  parsed.contact?.location  ?? "",
      linkedin:  parsed.contact?.linkedin  ?? "",
      github:    parsed.contact?.github    ?? "",
      portfolio: parsed.contact?.portfolio ?? "",
      headline:  parsed.contact?.headline  ?? "",
    };
    parsed.summary                  = parsed.summary ?? "";
    parsed.experience               = Array.isArray(parsed.experience)               ? parsed.experience               : [];
    parsed.education                = Array.isArray(parsed.education)                ? parsed.education                : [];
    parsed.skills                   = Array.isArray(parsed.skills)                   ? parsed.skills                   : [];
    parsed.certifications           = Array.isArray(parsed.certifications)           ? parsed.certifications           : [];
    parsed.projects                 = Array.isArray(parsed.projects)                 ? parsed.projects                 : [];
    parsed.languages                = Array.isArray(parsed.languages)                ? parsed.languages                : [];
    parsed.awards                   = Array.isArray(parsed.awards)                   ? parsed.awards                   : [];
    parsed.publications             = Array.isArray(parsed.publications)             ? parsed.publications             : [];
    parsed.volunteer                = Array.isArray(parsed.volunteer)                ? parsed.volunteer                : [];
    parsed.professional_memberships = Array.isArray(parsed.professional_memberships) ? parsed.professional_memberships : [];

    return NextResponse.json(parsed);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[resume/parse] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
