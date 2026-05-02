/**
 * POST /api/resume/parse
 *
 * Structured resume extraction via Anthropic tool_use.
 *
 * The model is given an `extract_resume` tool whose input_schema declares
 * exactly the shape we want, including which fields are required. Forcing
 * `tool_choice: { type: "tool", name: "extract_resume" }` makes Claude
 * populate the schema completely instead of free-form prose, which closes
 * the 'parser not pulling all relevant data' gap the previous string-prompt
 * approach hit.
 *
 * Inputs (any one of):
 *   1. JSON  { text: string }
 *   2. JSON  { fileBase64: string, mimeType: "application/pdf" }
 *   3. FormData { file: File }   (PDF | DOCX | DOC | TXT)
 *
 * Word docs are flattened to text via mammoth. PDFs are sent natively to
 * Claude as a document block. All other files are read as UTF-8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { createTracedClient } from "@/lib/observability/langfuse";
import mammoth from "mammoth";

// ── Output types (shape the route returns to the client) ──────────────────────

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
  certifications: string[];
  projects: ParsedProject[];
  languages: ParsedLanguage[];
  awards: string[];
  publications: string[];
  volunteer: ParsedExperience[];
  professional_memberships: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Strip AI placeholder tokens like <UNKNOWN>, <NAME>, etc. */
const PLACEHOLDER_RE = /^<[A-Z_]+>$/;
function cleanString(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return PLACEHOLDER_RE.test(trimmed) ? "" : trimmed;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim())).filter(Boolean);
}

// ── Extraction tool ───────────────────────────────────────────────────────────

const EXTRACT_TOOL: Anthropic.Messages.Tool = {
  name: "extract_resume",
  description:
    "Extract structured resume data. Populate every field that exists in the resume. Be exhaustive — preserve numbers, do not summarize bullets, do not drop content. Use empty string \"\" for missing strings and empty array [] for missing arrays.",
  input_schema: {
    type: "object",
    properties: {
      contact: {
        type: "object",
        description: "Header / personal contact block",
        properties: {
          name:      { type: "string", description: "Full name" },
          email:     { type: "string", description: "Email address" },
          phone:     { type: "string", description: "Phone with formatting, e.g. '(415) 555-1234'" },
          location:  { type: "string", description: "City, state/country" },
          linkedin:  { type: "string", description: "Full LinkedIn URL if present" },
          github:    { type: "string", description: "Full GitHub URL if present" },
          portfolio: { type: "string", description: "Personal site / portfolio URL" },
          headline:  { type: "string", description: "Tagline or role title at top of resume" },
        },
        required: ["name", "email", "phone", "location", "linkedin", "github", "portfolio", "headline"],
      },
      summary: {
        type: "string",
        description: "Professional summary / objective paragraph ONLY. Do not include other sections.",
      },
      experience: {
        type: "array",
        description: "EVERY work experience entry. Do not skip jobs. Do not summarize bullets — preserve quantified outcomes verbatim.",
        items: {
          type: "object",
          properties: {
            title:        { type: "string", description: "Job title" },
            company:      { type: "string", description: "Company / organization name" },
            location:     { type: "string", description: "Job location, empty if not listed" },
            period:       { type: "string", description: "Human-readable date range, e.g. 'Jan 2022 – Present'" },
            start_date:   { type: "string", description: "Start date in YYYY-MM or YYYY format" },
            end_date:     { type: "string", description: "End date in YYYY-MM, YYYY, or 'Present'" },
            bullets:      {
              type: "array",
              items: { type: "string" },
              description: "EVERY bullet point or sentence describing accomplishments/responsibilities. Preserve numbers and percentages exactly.",
            },
            technologies: {
              type: "array",
              items: { type: "string" },
              description: "Tools / tech / frameworks mentioned in this role's bullets",
            },
          },
          required: ["title", "company", "location", "period", "start_date", "end_date", "bullets", "technologies"],
        },
      },
      education: {
        type: "array",
        description: "EVERY education entry",
        items: {
          type: "object",
          properties: {
            degree:         { type: "string", description: "Degree type, e.g. 'Bachelor of Science'" },
            field_of_study: { type: "string", description: "Field, e.g. 'Computer Science'" },
            school:         { type: "string", description: "Institution name" },
            location:       { type: "string", description: "School location" },
            year:           { type: "string", description: "Graduation year" },
            gpa:            { type: "string", description: "GPA if listed, else empty string" },
            honors:         { type: "string", description: "Honors / awards / cum laude designations" },
          },
          required: ["degree", "field_of_study", "school", "location", "year", "gpa", "honors"],
        },
      },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "ALL skills as individual items. Include hard skills, tools, frameworks, methodologies. Also pull in technologies mentioned in experience bullets. Deduplicate. Do NOT include sentences.",
      },
      certifications: {
        type: "array",
        items: { type: "string" },
        description: "ALL certifications, formatted as 'Name — Issuer (Year)' when known. Examples: 'AWS Solutions Architect — Amazon (2023)', 'PMP — PMI (2021)'. If only the name is known, just use the name.",
      },
      projects: {
        type: "array",
        description: "Personal / portfolio projects (not paid jobs)",
        items: {
          type: "object",
          properties: {
            title:        { type: "string" },
            description:  { type: "string" },
            technologies: { type: "array", items: { type: "string" } },
            url:          { type: "string", description: "Project URL if listed, else empty" },
          },
          required: ["title", "description", "technologies", "url"],
        },
      },
      languages: {
        type: "array",
        description: "Spoken languages with proficiency",
        items: {
          type: "object",
          properties: {
            name:        { type: "string", description: "Language name, e.g. 'Spanish'" },
            proficiency: { type: "string", description: "Native, Fluent, Conversational, Basic, or Stated if no level given" },
          },
          required: ["name", "proficiency"],
        },
      },
      awards:                   { type: "array", items: { type: "string" }, description: "Honors, awards, recognitions, scholarships" },
      publications:             { type: "array", items: { type: "string" }, description: "Papers, articles, books — full citation" },
      volunteer:                {
        type: "array",
        description: "Volunteer experience using the same shape as paid experience",
        items: {
          type: "object",
          properties: {
            title:        { type: "string" },
            company:      { type: "string", description: "Organization name" },
            location:     { type: "string" },
            period:       { type: "string" },
            start_date:   { type: "string" },
            end_date:     { type: "string" },
            bullets:      { type: "array", items: { type: "string" } },
            technologies: { type: "array", items: { type: "string" } },
          },
          required: ["title", "company", "location", "period", "start_date", "end_date", "bullets", "technologies"],
        },
      },
      professional_memberships: { type: "array", items: { type: "string" }, description: "Associations, societies, professional bodies" },
    },
    required: [
      "contact", "summary", "experience", "education",
      "skills", "certifications", "projects", "languages",
      "awards", "publications", "volunteer", "professional_memberships",
    ],
  },
};

const SYSTEM_PROMPT =
  "You are an expert resume parser. Use the extract_resume tool to return ALL structured data from the resume. " +
  "Be EXHAUSTIVE — extract every distinct piece of information. Preserve numbers and percentages verbatim. " +
  "Do not summarize bullet points — copy them closely. " +
  "If a section doesn't exist in the resume, return an empty string \"\" or empty array []. " +
  "Pull every skill, framework, and technology listed — include the ones mentioned inside experience bullets too. " +
  "You MUST call the extract_resume tool. Do not respond with prose.";

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeExperience(arr: unknown): ParsedExperience[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      title:        cleanString(o.title),
      company:      cleanString(o.company),
      location:     cleanString(o.location),
      period:       cleanString(o.period),
      start_date:   cleanString(o.start_date),
      end_date:     cleanString(o.end_date),
      bullets:      asStringArray(o.bullets),
      technologies: asStringArray(o.technologies),
    };
  });
}

function normalizeEducation(arr: unknown): ParsedEducation[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      degree:         cleanString(o.degree),
      field_of_study: cleanString(o.field_of_study),
      school:         cleanString(o.school),
      location:       cleanString(o.location),
      year:           cleanString(o.year),
      gpa:            cleanString(o.gpa),
      honors:         cleanString(o.honors),
    };
  });
}

function normalizeProjects(arr: unknown): ParsedProject[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      title:        cleanString(o.title),
      description:  cleanString(o.description),
      technologies: asStringArray(o.technologies),
      url:          cleanString(o.url),
    };
  });
}

function normalizeLanguages(arr: unknown): ParsedLanguage[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      name:        cleanString(o.name),
      proficiency: cleanString(o.proficiency) || "Stated",
    };
  });
}

function normalize(raw: unknown): ParsedResume {
  const o = (raw ?? {}) as Record<string, unknown>;
  const contact = (o.contact ?? {}) as Record<string, unknown>;
  return {
    contact: {
      name:      cleanString(contact.name),
      email:     cleanString(contact.email),
      phone:     cleanString(contact.phone),
      location:  cleanString(contact.location),
      linkedin:  cleanString(contact.linkedin),
      github:    cleanString(contact.github),
      portfolio: cleanString(contact.portfolio),
      headline:  cleanString(contact.headline),
    },
    summary:                  cleanString(o.summary),
    experience:               normalizeExperience(o.experience),
    education:                normalizeEducation(o.education),
    skills:                   asStringArray(o.skills),
    certifications:           asStringArray(o.certifications),
    projects:                 normalizeProjects(o.projects),
    languages:                normalizeLanguages(o.languages),
    awards:                   asStringArray(o.awards),
    publications:             asStringArray(o.publications),
    volunteer:                normalizeExperience(o.volunteer),
    professional_memberships: asStringArray(o.professional_memberships),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

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
        userContent.push({ type: "text", text: "Parse this resume by calling the extract_resume tool. Be exhaustive." });
      } else if (isWordFile(file.type, file.name)) {
        const { value: extractedText, messages: warnings } = await mammoth.extractRawText({ buffer });
        if (warnings.length > 0) {
          console.warn("[resume/parse] mammoth warnings:", warnings.map(w => w.message).join("; "));
        }
        if (!extractedText.trim()) {
          return NextResponse.json({ error: "Could not extract text from Word document. Try saving as PDF or pasting the text." }, { status: 422 });
        }
        userContent.push({ type: "text", text: `Parse this resume by calling the extract_resume tool. Be exhaustive.\n\nRESUME TEXT:\n${extractedText}` });
      } else {
        const text = buffer.toString("utf-8");
        if (text.trim().length < 20) {
          return NextResponse.json({ error: "File appears to be empty or too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume by calling the extract_resume tool. Be exhaustive.\n\nRESUME TEXT:\n${text}` });
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
        userContent.push({ type: "text", text: "Parse this resume by calling the extract_resume tool. Be exhaustive." });
      } else if (body.text) {
        if (body.text.trim().length < 20) {
          return NextResponse.json({ error: "Resume text is too short to parse." }, { status: 400 });
        }
        userContent.push({ type: "text", text: `Parse this resume by calling the extract_resume tool. Be exhaustive.\n\nRESUME TEXT:\n${body.text}` });
      } else {
        return NextResponse.json({ error: "Provide 'text', 'fileBase64', or upload a file." }, { status: 400 });
      }
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_resume" },
      messages: [{ role: "user", content: userContent }],
    });

    // Extract the tool_use block — should always be present given tool_choice.
    const toolUse = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "extract_resume"
    );

    if (toolUse?.input) {
      return NextResponse.json(normalize(toolUse.input));
    }

    // Defensive fallback: model returned a text block instead. Try to JSON.parse it.
    const textBlock = message.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    if (textBlock?.text) {
      const jsonStr = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      try {
        return NextResponse.json(normalize(JSON.parse(jsonStr)));
      } catch {
        // Fall through
      }
    }

    throw new Error("No tool_use or parsable text in Claude response");

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[resume/parse] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
