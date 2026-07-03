/**
 * POST /api/jobs/resolve-url — resolves an Adzuna redirect (or any other
 * tracker URL) to the direct employer URL by following up to 3 redirects.
 * Falls back to returning the input URL unchanged when resolution fails,
 * so callers always get a valid URL to open.
 *
 * Auth required — resolving arbitrary URLs is not something we want
 * unauthenticated traffic hitting.
 *
 * fix/jobs-smart-apply-issues Fix 5.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

const TRACKER_HOSTS = /adzuna\.com|indeed\.com\/rc\/|glassdoor\.com\/partner|ziprecruiter\.com\/j\//i;

async function followRedirects(initialUrl: string, hops = 3): Promise<string> {
  let currentUrl = initialUrl;
  for (let i = 0; i < hops; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(currentUrl, {
        method:   "HEAD",
        redirect: "manual",
        signal:   controller.signal,
        headers:  { "User-Agent": "Mozilla/5.0 iCareerOS-JobFetcher/1.0" },
      });
      clearTimeout(timeout);
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return currentUrl;
        currentUrl = new URL(next, currentUrl).href;
        continue;
      }
      return currentUrl;
    } catch {
      return currentUrl;
    }
  }
  return currentUrl;
}

export async function POST(req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
  }

  // If it doesn't look like a tracker, return as-is (fast path).
  if (!TRACKER_HOSTS.test(url)) {
    return NextResponse.json({ url, wasResolved: false });
  }

  const resolved = await followRedirects(url, 3);
  const wasResolved = resolved !== url && !TRACKER_HOSTS.test(resolved);
  return NextResponse.json({ url: wasResolved ? resolved : url, wasResolved });
}
