import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchJobFromUrl } from "@/lib/jobs/fetchJobFromUrl";

/**
 * POST /api/jobs/fetch-jd
 *
 * Lightweight wrapper around the existing fetchJobFromUrl library, exposed
 * as a public-facing endpoint with a simple contract for client surfaces
 * (e.g. /fit-check) that only need the plain-text description.
 *
 * Request  : { url: string }
 * Response : { jobDescription: string, source?: string, title?: string,
 *              company?: string, location?: string }
 * Errors   : 400 invalid URL · 422 fetch failed / empty body · 500 unexpected
 *
 * Auth required. Uses fetchJobFromUrl's ATS fast-paths (Greenhouse / Lever /
 * Ashby) when applicable and falls back to a regex HTML strip otherwise.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SuccessBody {
  jobDescription: string;
  source?:        string;
  title?:         string;
  company?:       string;
  location?:      string;
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Validate body ──────────────────────────────────────────────────────
  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Basic URL shape validation — distinguishes "wrong shape" (400) from
  // "looks fine but the remote 404'd / blocked us" (422).
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are supported" }, { status: 400 });
  }

  // ── Fetch + extract ────────────────────────────────────────────────────
  try {
    const result = await fetchJobFromUrl(url);

    if (!result.ok) {
      // Library tells us why; surface a clean 422 with the message.
      return NextResponse.json(
        { error: result.error || "Could not fetch a usable job description from this URL." },
        { status: 422 },
      );
    }

    const description = (result.description ?? "").trim();
    if (description.length === 0) {
      return NextResponse.json(
        { error: "The fetched page did not contain a usable job description." },
        { status: 422 },
      );
    }

    const body: SuccessBody = {
      jobDescription: description,
      source:         result.source,
      title:          result.title,
      company:        result.company,
      location:       result.location,
    };
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
