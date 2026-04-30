import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Route lists ────────────────────────────────────────────────────────────
const PROTECTED = ["/dashboard", "/settings", "/jobs", "/profile", "/interview", "/resume", "/offers", "/support", "/recruiter"];
const AUTH_ONLY = ["/auth/login", "/auth/signup"];

// AI-heavy routes get a stricter per-user rate limit
const AI_ROUTES = [
  "/api/career-os",
  "/api/resume/rewrite",
  "/api/cover-letter",
  "/api/outreach",
  "/api/recruiter",
  "/api/salary-intelligence",
  "/api/jobs/fit-scores",
];

// ─── Rate limiting (Upstash Redis REST, graceful fallback) ───────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function checkRateLimit(
  key: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    // Redis not configured (dev / CI) — allow all
    return { allowed: true, remaining: limitPerMinute };
  }

  try {
    const bucket = Math.floor(Date.now() / 60_000); // 1-minute window
    const rKey = `rl:${key}:${bucket}`;

    // INCR + EXPIRE in a single pipeline
    const pipeline = [
      ["INCR", rKey],
      ["EXPIRE", rKey, 61],
    ];

    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) return { allowed: true, remaining: limitPerMinute };

    const data = (await res.json()) as Array<{ result: number }>;
    const count = data[0]?.result ?? 0;
    const remaining = Math.max(0, limitPerMinute - count);

    return { allowed: count <= limitPerMinute, remaining };
  } catch {
    // Network error or parse failure — fail open
    return { allowed: true, remaining: limitPerMinute };
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2]
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Auth guards ────────────────────────────────────────────────────────────
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ONLY.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Rate limiting (API routes only) ───────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const isAiRoute = AI_ROUTES.some((r) => pathname.startsWith(r));

    let rlResult: { allowed: boolean; remaining: number };

    if (isAiRoute && user) {
      // AI routes: 20 req/min per authenticated user
      rlResult = await checkRateLimit(`user:${user.id}`, 20);
    } else if (isAiRoute) {
      // AI routes, unauthenticated: 5 req/min per IP (should have been blocked by auth guard already)
      rlResult = await checkRateLimit(`ip-ai:${ip}`, 5);
    } else {
      // General API: 60 req/min per IP
      rlResult = await checkRateLimit(`ip:${ip}`, 60);
    }

    if (!rlResult.allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // Pass remaining count downstream as a header (useful for client-side feedback)
    response.headers.set(
      "X-RateLimit-Remaining",
      String(rlResult.remaining)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
