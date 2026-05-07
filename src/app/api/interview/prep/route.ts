/**
 * POST /api/interview/prep
 *
 * One-shot interview-prep guide. Streams Sonnet 4.6 as SSE.
 *
 * Phase 4 — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Replaces the previous edge-function call to `generate-interview-prep`.
 * Same auth + plan gate as /api/interview/session.
 *
 * Output: a markdown-styled prep guide (## headers + - bullets) that the
 * page's existing PrepContent renderer can display. Streamed token-by-token
 * for consistency with the rest of Phase 4's chat surfaces.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { checkPlanLimit }     from "@/lib/billing/checkPlanLimit";

interface PostBody {
  jobTitle?:       string;
  jobDescription?: string;
  resume?:         string;
}

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component */ }
        },
      },
    },
  );
}

const PREP_SYSTEM = `You are a senior interview prep coach.

Given a job title and (optional) job description and resume, produce a focused, scannable interview-prep brief in markdown:

## Likely behavioural questions
- 4-5 specific questions that interviewers commonly ask for this role
- Each starts with the question, then a one-line "What they're really looking for"

## Strengths to lead with
- 3 specific strengths to anchor responses around (tie to provided resume if available, otherwise generic for the role)

## Stories to prepare
- 3 STAR-format prompts (Situation/Task/Action/Result) covering common evaluation themes

## Gaps to acknowledge proactively
- 2-3 likely soft gaps and the framing that turns them into growth narratives

## Final tip
- One tactical tip specific to interviewing for this role

Constraints:
- Use markdown (## headers, - bullets) so the UI's PrepContent renderer formats it cleanly
- No "Overall Readiness:" line — that's reserved for the per-turn coach's final summary
- Keep total length under ~600 words`;

export async function POST(req: Request) {
  const supabase = await makeSupabaseServer();

  // 1. Auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Plan gate
  const limitBlock = await checkPlanLimit(supabase, user.id, "aiCoach");
  if (limitBlock) return limitBlock;

  // 3. Body
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const jobTitle = (body?.jobTitle ?? "").trim();
  const jd       = (body?.jobDescription ?? "").trim();
  const resume   = (body?.resume ?? "").trim();
  if (!jobTitle && !jd) {
    return NextResponse.json({ error: "jobTitle or jobDescription is required" }, { status: 400 });
  }

  const userMessage = [
    "Job title: " + (jobTitle || "(not specified — infer from JD)"),
    "",
    "Job description:",
    jd || "(not provided — write generically for the title)",
    "",
    "Candidate resume excerpt:",
    resume || "(not provided — write for an experienced professional applying for this role)",
    "",
    "Generate the prep brief now.",
  ].join("\n");

  // 4. Stream Sonnet 4.6
  const anthropic = createTracedClient(user.id, "interview/prep");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sysBlocks: any = [{
          type: "text",
          text: PREP_SYSTEM,
          cache_control: { type: "ephemeral" },
        }];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lstream = (anthropic as any).messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: sysBlocks,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of lstream) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            const t = event.delta.text as string;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: t })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`));
        controller.close();
      } catch (err) {
        const m = err instanceof Error ? err.message : "Internal error";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: m })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      "Connection":    "keep-alive",
    },
  });
}
