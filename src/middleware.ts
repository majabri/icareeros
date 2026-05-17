import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Route lists ────────────────────────────────────────────────────────────
const PROTECTED = ["/dashboard", "/settings", "/jobs", "/profile", "/mycareer", "/targetskills", "/interview", "/resumeadvisor", "/offers", "/support", "/recruiter"];
const ADMIN_PROTECTED = ["/admin"];
const AUTH_ONLY = ["/auth/login", "/auth/signup"];

// Admin status is read from public.profiles.role per request below.
// (Removed hardcoded ADMIN_EMAILS — admin assignment is now DB-driven so
// promote/demote actions in /admin/users actually take effect.)

// AI-heavy routes get a stricter per-user rate limit
const AI_ROUTES = [
  "/api/career-os",
  "/api/resume/rewrite",
  "/api/resume/critique",
  "/api/resume/cover-letter-from-text",
  "/api/cover-letter",
  "/api/outreach",
  "/api/recruiter",
  "/api/salary-intelligence",
  "/api/jobs/fit-scores",
  "/api/jobs/agent",
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

// ─── Multi-domain helpers ────────────────────────────────────────────────────
//
// Phase 1 subdomain split (2026-05-16):
//   - icareeros.com          → marketing + auth (root domain)
//   - jobs.icareeros.com     → job-seeker app
//   - hired.icareeros.com    → recruiter app (stub for now)
//
// Auth cookies are scoped to `.icareeros.com` in production so a session
// created on the root domain is valid on every subdomain.

const PROD_COOKIE_DOMAIN = ".icareeros.com";

function isProductionHost(host: string): boolean {
  // .vercel.app preview deploys also need the cross-subdomain cookie scope
  // disabled (different parent domain). Only set the cookie domain on the
  // real icareeros.com production hosts.
  return host.endsWith("icareeros.com");
}

function platformFromHost(host: string): "jobs" | "hired" | "root" {
  if (host.startsWith("jobs."))  return "jobs";
  if (host.startsWith("hired.")) return "hired";
  return "root";
}

// ─── Middleware ──────────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // Phase 1 Task 2 — Hostname detection. The x-platform header lets
  // downstream server components/route handlers tailor copy or links
  // without re-parsing the host themselves.
  const platform     = platformFromHost(hostname);
  const isJobsHost   = platform === "jobs";
  const isHiredHost  = platform === "hired";
  const isRootHost   = platform === "root";
  const useProdCookies = isProductionHost(hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-platform", platform);

  // Phase 1 Task 2 — hired.icareeros.com routes everything (except auth
  // and api) under /hired/*. The (hired) app route group (created in
  // Task 3) owns those pages. Rewrites preserve the public URL while
  // resolving to the internal app shell — so users still see
  // `hired.icareeros.com/dashboard` in the address bar.
  if (
    isHiredHost
    && !pathname.startsWith("/hired")
    && !pathname.startsWith("/auth")
    && !pathname.startsWith("/api")
    && !pathname.startsWith("/_next")
  ) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/hired${pathname === "/" ? "/dashboard" : pathname}`;
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
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
          response = NextResponse.next({ request: { headers: requestHeaders } });
          // Phase 1 Task 1 — scope auth cookies to the parent domain in
          // production so a session works across icareeros.com,
          // jobs.icareeros.com, and hired.icareeros.com. Preview deploys
          // (*.vercel.app) and local dev keep the default per-host scope.
          cookiesToSet.forEach(({ name, value, options }) => {
            const finalOptions = {
              ...(options ?? {}),
              ...(useProdCookies ? { domain: PROD_COOKIE_DOMAIN } : {}),
            };
            response.cookies.set(
              name,
              value,
              finalOptions as Parameters<typeof response.cookies.set>[2]
            );
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Auth guards ────────────────────────────────────────────────────────────
  // Look up role from public.profiles to determine admin status. Single
  // SELECT per request; cheap. Falls back to non-admin on any error.
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, admin_role")
      .eq("user_id", user.id)
      .maybeSingle();
    // Sprint 4 W1-C: 5-tier admin_role wins. Backward compat: legacy
    // role='admin' (binary, pre-Sprint-4) still grants admin access. Once
    // every admin has an explicit admin_role, the `role === 'admin'`
    // fallback can be removed.
    isAdmin = Boolean(profile?.admin_role) || profile?.role === "admin";
  }
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAdminProtected = ADMIN_PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ONLY.some((p) => pathname.startsWith(p));

  // Unauthenticated users hitting protected routes → login
  if ((isProtected || isAdminProtected) && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    if (isHiredHost) loginUrl.searchParams.set("platform", "hired");
    return NextResponse.redirect(loginUrl);
  }

  // Admin accounts must stay in the admin panel — never the career OS
  if (isProtected && user && isAdmin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Non-admin accounts cannot access admin routes
  if (isAdminProtected && user && !isAdmin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // After login: route by role to the correct subdomain.
  //   admin                            → /admin
  //   employer ∧ job_seeker (dual)     → /auth/choose-platform
  //   employer                         → hired.icareeros.com/dashboard
  //   job_seeker (default)             → jobs.icareeros.com/dashboard
  if (isAuthRoute && user) {
    if (isAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    // Look up role memberships from user_roles (multi-row table).
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = new Set((roleRows ?? []).map((r) => (r as { role?: string }).role).filter(Boolean) as string[]);
    const hasEmployer  = roles.has("employer");
    const hasJobSeeker = roles.has("job_seeker") || roles.size === 0; // default: job seeker

    if (hasEmployer && hasJobSeeker) {
      return NextResponse.redirect(new URL("/auth/choose-platform", request.url));
    }

    const isProd = process.env.NODE_ENV === "production";
    if (hasEmployer) {
      const dest = isProd
        ? (process.env.NEXT_PUBLIC_HIRED_URL ?? "https://hired.icareeros.com") + "/dashboard"
        : "/hired/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // job_seeker (default)
    const dest = isProd
      ? (process.env.NEXT_PUBLIC_JOBS_URL ?? "https://jobs.icareeros.com") + "/dashboard"
      : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Root domain (icareeros.com): authed users stay on the landing page
  // by default — no auto-redirect to /dashboard. They can navigate to
  // their app via the CTA / nav. Admin guard above still applies for
  // /admin paths. This block is intentionally empty — documenting the
  // decision so future readers don't re-add an auto-redirect.
  void isRootHost;
  void isJobsHost;

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
