import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isProductionHost, platformFromHost } from "@/lib/platform-host";

// ─── Route lists ────────────────────────────────────────────────────────────
const PROTECTED = ["/dashboard", "/settings", "/jobs", "/profile", "/mycareer", "/targetskills", "/interview", "/evaluate", "/advise", "/learn", "/act", "/coach", "/achieve", "/offers", "/support", "/recruiter"];
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
//   - hire.icareeros.com    → recruiter app (stub for now)
//
// Auth cookies are scoped to `.icareeros.com` in production so a session
// created on the root domain is valid on every subdomain.

const PROD_COOKIE_DOMAIN = ".icareeros.com";

// platformFromHost / isProductionHost live in @/lib/platform-host so they
// can be unit-tested independently of the middleware runtime.

// ─── Middleware ──────────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // Phase 1 Task 2 — Hostname detection. The x-platform header lets
  // downstream server components/route handlers tailor copy or links
  // without re-parsing the host themselves.
  const platform     = platformFromHost(hostname);
  const isJobsHost   = platform === "jobs";
  const isHireHost  = platform === "hire";
  const isRootHost   = platform === "root";
  const useProdCookies = isProductionHost(hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-platform", platform);

  // Phase 3 (2026-05-18) — registration lives ONLY on the root domain
  // (icareeros.com). Any /auth/signup hit on a subdomain bounces to
  // icareeros.com/auth/signup with the right ?role= preset, so the
  // employer/job-seeker selection still flows through naturally.
  if (
    pathname === "/auth/signup"
    && (isJobsHost || isHireHost)
    && isProductionHost(hostname)
  ) {
    const role = isHireHost ? "employer" : "job_seeker";
    const dest = new URL("https://icareeros.com/auth/signup");
    dest.searchParams.set("role", role);
    // Preserve any extra query (e.g. ?next=) the client passed in.
    for (const [k, v] of request.nextUrl.searchParams.entries()) {
      if (k !== "role") dest.searchParams.set(k, v);
    }
    return NextResponse.redirect(dest, 308);
  }

  // Phase 3 (2026-05-17) — hire.icareeros.com keeps a clean URL surface:
  // the internal `(hire)/hire/*` route folder is rewritten to from the
  // root pathname so users always see `hire.icareeros.com/dashboard`,
  // never `/hire/dashboard`.
  //
  // Two-step:
  //   1) If a user lands on `hire.icareeros.com/hire/<x>` (bookmark, an
  //      old link, or a search-engine result from a prior deploy), 308
  //      redirect to `hire.icareeros.com/<x>` so the ugly prefix never
  //      appears in the address bar.
  //   2) For every other path on hire.*, rewrite internally to /hire/<x>
  //      so Next routes into the (hire) route group without the URL bar
  //      noticing.
  if (
    isHireHost
    && pathname.startsWith("/hire")
    && !pathname.startsWith("/_next")
  ) {
    const clean = pathname === "/hire" ? "/" : pathname.replace(/^\/hire/, "");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = clean || "/";
    return NextResponse.redirect(redirectUrl, 308);
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
          // jobs.icareeros.com, and hire.icareeros.com. Preview deploys
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

  // Phase 4 (2026-05-19, auth-gate added 2026-05-21) —
  //
  // The `/` path on hire.* is no longer auto-rewritten here; it's
  // handled below by Phase 5 so that:
  //   - unauthenticated visitors render `src/app/page.tsx` (HireLanding
  //     variant, driven by `x-platform === "hire"`)
  //   - authenticated visitors rewrite to /hire/dashboard
  //
  // Every other path on hire.* still rewrites into the (hire) route
  // group — BUT must require authentication. Without an auth gate
  // inside this block, unauthenticated visitors to /design, /select,
  // /integrate, /support, /develop, /retain, /settings, /profile, and
  // /candidates would reach the page directly because this block
  // `return`s before the PROTECTED check at the bottom of middleware
  // ever runs. The auth gate added 2026-05-21 closes that gap.
  if (
    isHireHost
    && pathname !== "/"
    && !pathname.startsWith("/auth")
    && !pathname.startsWith("/api")
    && !pathname.startsWith("/_next")
  ) {
    if (!user) {
      // Unauthenticated → centralized auth on icareeros.com. Carry the
      // intended destination + platform tag so the post-login flow can
      // bring the user back to the page they wanted.
      const loginUrl = new URL("https://icareeros.com/auth/login");
      loginUrl.searchParams.set("redirect", `https://hire.icareeros.com${pathname}`);
      loginUrl.searchParams.set("platform", "hire");
      return NextResponse.redirect(loginUrl);
    }
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/hire${pathname}`;
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  // Phase 5 (rev 2026-05-27) — Subdomain landings RESTORED.
  // Previously (2026-05-20) unauthenticated jobs.* / and hire.* / were
  // 308-redirected to anchor sections on icareeros.com. That collapse
  // is reversed: jobs.icareeros.com and hire.icareeros.com now serve
  // their own full standalone landing pages, with the root landing's
  // nav linking out to them.
  //
  // jobs.* `/` :
  //   unauthed  → falls through to src/app/page.tsx (renders JobsLanding
  //               via x-platform header branching)
  //   authed    → /dashboard on jobs.* (unchanged)
  // hire.* `/` :
  //   unauthed  → falls through to src/app/page.tsx (renders HireLanding
  //               via x-platform header branching)
  //   authed    → rewrite to /hire/dashboard (Phase 4 behaviour, only
  //               for authed users at root)
  if (isJobsHost && pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (isHireHost && pathname === "/" && user) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/hire/dashboard";
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

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
    if (isHireHost) loginUrl.searchParams.set("platform", "hire");
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
  //   employer                         → hire.icareeros.com/dashboard
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
        ? ((process.env.NEXT_PUBLIC_HIRE_URL ?? process.env.NEXT_PUBLIC_HIRED_URL ?? "https://hire.icareeros.com")) + "/dashboard"
        : "/hire/dashboard";
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
