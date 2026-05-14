import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchJobFromUrl } from "@/lib/jobs/fetchJobFromUrl";

/**
 * POST /api/resume/fetch-job-url
 *
 * Body:  { url: string }
 * Resp:  { ok: true, source, title?, company?, location?, description }
 *      | { ok: false, error: string }
 *
 * Authenticated. Resolves a job-posting URL to a clean text payload the
 * fit-check / rewrite / cover-letter LLM routes can read. Closes the
 * /resumeadvisor "Job URL" mode that previously sent the URL string to the
 * LLM without actually fetching the content.
 *
 * Fast paths for Greenhouse / Lever / Ashby (public JSON APIs); generic
 * HTML fallback for everything else.
 */

export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let url: string;
  try {
    const body = await req.json() as { url?: string };
    url = (body.url ?? "").trim();
    if (!url) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await fetchJobFromUrl(url);
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}
