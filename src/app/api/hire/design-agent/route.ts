/**
 * POST /api/hire/design-agent — Stage 01 Design AI agent.
 *
 * Drafts a structured job description from a recruiter's plain-language
 * description of a role.
 *
 * Architecture:
 *   - Model: claude-haiku-4-5 (per brief — JD drafting is short
 *     structured output, doesn't need Sonnet)
 *   - Tracing: createTracedClient via Langfuse (mandatory per HIRE
 *     channel rules)
 *   - Output: strict JSON { title, description, requirements, nice_to_haves }
 *     parsed server-side so the client doesn't have to deal with
 *     malformed model output
 *   - Non-streaming v1 per CP1 routing decision 2026-05-22 (target-
 *     suggestions / coach-brief established pattern)
 *
 * Distinct from /api/hire/job-postings (which handles the CRUD on
 * the resulting row). This route only produces the draft text;
 * the recruiter reviews + edits before saving.
 *
 * Body: { description: string (5..2000 chars) }
 * Returns: { title, description, requirements, nice_to_haves }
 *   404 / 500 paths: { error: string }
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { createTracedClient } from "@/lib/observability/langfuse";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCrossSubdomainCookie(options)),
            );
          } catch { /* server context */ }
        },
      },
    },
  );
}

const SYSTEM_PROMPT = `You are a job-description specialist for an applicant tracking system. The employer will describe a role in plain language. Draft a professional job description with:

- A compelling, specific title (e.g. "Senior Backend Engineer (Go)" rather than "Engineer")
- A 2-3 sentence company/role overview (description) — what the team does and why this role matters
- Requirements: 5-7 must-have qualifications, one per line, no bullet characters or dashes
- Nice-to-haves: 3-5 preferred qualifications, one per line, no bullet characters or dashes

Tone: professional, specific, plain English. Avoid clichés ("rockstar", "ninja", "synergy").

Respond ONLY with valid JSON in exactly this shape. No prose before or after, no markdown code fences:
{
  "title": "string",
  "description": "string",
  "requirements": "line one\\nline two\\n...",
  "nice_to_haves": "line one\\nline two\\n..."
}`;

interface DraftOutput {
  title:         string;
  description:   string;
  requirements:  string;
  nice_to_haves: string;
}

function tryParseDraft(text: string): DraftOutput | null {
  // Strip ```json fences if the model added them despite instructions.
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    if (
      typeof obj.title === "string" &&
      typeof obj.description === "string" &&
      typeof obj.requirements === "string" &&
      typeof obj.nice_to_haves === "string"
    ) {
      return {
        title:         obj.title,
        description:   obj.description,
        requirements:  obj.requirements,
        nice_to_haves: obj.nice_to_haves,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: Request) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { description?: unknown };
  try {
    body = (await req.json()) as { description?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.description !== "string" || body.description.trim().length < 5) {
    return NextResponse.json(
      { error: "description must be at least 5 characters" },
      { status: 400 },
    );
  }
  if (body.description.length > 2000) {
    return NextResponse.json(
      { error: "description must be 2000 characters or fewer" },
      { status: 400 },
    );
  }

  const userPrompt = `Role description from employer:\n\n${body.description.trim()}\n\nDraft the structured JD now. JSON only.`;

  try {
    const anthropic = createTracedClient(user.id, "hire/design-agent");
    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    });

    // SDK shape: { content: [{ type: "text", text: "..." }, ...] }
    const textBlock = response.content.find(
      (b) => b.type === "text",
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) {
      return NextResponse.json(
        { error: "Empty response from model" },
        { status: 502 },
      );
    }

    const parsed = tryParseDraft(textBlock.text);
    if (!parsed) {
      return NextResponse.json(
        { error: "Model returned malformed JSON. Try again or fill in manually." },
        { status: 502 },
      );
    }
    return NextResponse.json(parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to draft job description";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
