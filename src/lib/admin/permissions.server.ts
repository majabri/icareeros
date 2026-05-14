/**
 * Sprint 4 W1-B — Server-only permission helpers.
 *
 * Splits the server-side pieces (`next/headers`, service-role client) out
 * of the main module so the client bundle stays clean. Import from server
 * components, server actions, and API routes only.
 */

import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  hasPermission,
  isValidAdminRole,
  PERMISSIONS,
  type AdminRole,
  type Permission,
  type RequirePermissionResult,
  type RequestContext,
} from "./permissions";

/**
 * Server-side check used by API routes and server actions.
 *
 *   const r = await requirePermission("users.change_plan");
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
 *   // r.ctx.admin_role is now safe to read
 */
export async function requirePermission(
  permission: Permission,
): Promise<RequirePermissionResult> {
  const cookieStore = await cookies();
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* readonly in this context */ },
      },
    },
  );

  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  // Service-role to bypass profile-table RLS
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: profile } = await svc
    .from("profiles")
    .select("admin_role, role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Resolve effective admin_role:
  //   - explicit admin_role wins
  //   - legacy role='admin' falls back to super_admin (backward compat)
  let admin_role: AdminRole | null = null;
  if (profile?.admin_role && isValidAdminRole(profile.admin_role)) {
    admin_role = profile.admin_role as AdminRole;
  } else if (profile?.role === "admin") {
    admin_role = "super_admin";
  }

  if (!admin_role) {
    return { ok: false, status: 403, error: "Forbidden — no admin role" };
  }

  if (!hasPermission(admin_role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Forbidden — '${permission}' requires one of: ${PERMISSIONS[permission].join(", ")}`,
    };
  }

  return {
    ok: true,
    ctx: { user_id: user.id, email: user.email ?? "", admin_role },
  };
}

/** Build a 401/403 NextResponse from a failed gate. */
export function permissionErrorResponse(
  r: Extract<RequirePermissionResult, { ok: false }>,
): NextResponse {
  return NextResponse.json({ error: r.error }, { status: r.status });
}

/** Capture IP + User-Agent for audit log entries. Server-only. */
export async function readRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  return {
    ip_address: ip,
    user_agent: h.get("user-agent") ?? null,
  };
}
