/**
 * Sprint 4 W1-B — Admin role + permission helper
 *
 * 5-tier role model (admin_role column in public.profiles):
 *   super_admin > admin > support_l2 > support_l1 > viewer
 *
 * Permission checks are role-based, not user-based. A permission is allowed
 * if the user's role is in the permission's allowlist. NULL admin_role means
 * "not an admin at all" — every check returns false.
 *
 * Backward compatibility: existing rows with `role='admin'` (the binary
 * pre-Sprint-4 model) are treated as `admin_role='super_admin'` if the
 * `admin_role` column is NULL. This keeps the platform working during
 * the rollout window — once every admin has an explicit admin_role,
 * the `role='admin'` fallback can be removed.
 */

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// ── Types ────────────────────────────────────────────────────────────────

export type AdminRole =
  | "super_admin"
  | "admin"
  | "support_l2"
  | "support_l1"
  | "viewer";

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 5,
  admin:       4,
  support_l2:  3,
  support_l1:  2,
  viewer:      1,
};

// ── Permission matrix ────────────────────────────────────────────────────
// Each permission key lists the roles that hold it. Order doesn't matter.

export const PERMISSIONS = {
  // System / observability
  "system.view_metrics":     ["viewer", "support_l1", "support_l2", "admin", "super_admin"],
  "system.toggle_flags":     ["admin", "super_admin"],
  "system.deploy_history":   ["admin", "super_admin"],
  "system.run_console_cmd":  ["super_admin"],

  // Users
  "users.view_list":         ["support_l1", "support_l2", "admin", "super_admin"],
  "users.view_detail":       ["support_l1", "support_l2", "admin", "super_admin"],
  "users.change_plan":       ["support_l2", "admin", "super_admin"],
  "users.suspend":           ["admin", "super_admin"],
  "users.delete":            ["super_admin"],

  // Support tickets
  "support.view_tickets":    ["support_l1", "support_l2", "admin", "super_admin"],
  "support.respond_tickets": ["support_l1", "support_l2", "admin", "super_admin"],
  "support.close_tickets":   ["support_l1", "support_l2", "admin", "super_admin"],

  // Billing
  "billing.view":            ["support_l2", "admin", "super_admin"],
  "billing.refund":          ["super_admin"],
  "billing.comp_plan":       ["super_admin"],

  // Opportunities (job ingest)
  "opportunities.view":          ["support_l1", "support_l2", "admin", "super_admin"],
  "opportunities.force_ingest":  ["admin", "super_admin"],
  "opportunities.delete":        ["admin", "super_admin"],

  // Audit log
  "audit.view":              ["admin", "super_admin"],

  // Roles management
  "roles.assign":            ["super_admin"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

// ── Pure synchronous check (used in UI render decisions) ────────────────

export function hasPermission(
  role: AdminRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}

/** Returns true if `a` is at least as senior as `b` in the hierarchy. */
export function roleAtLeast(a: AdminRole | null | undefined, b: AdminRole): boolean {
  if (!a) return false;
  return ROLE_HIERARCHY[a] >= ROLE_HIERARCHY[b];
}

// ── Server-side permission gate ─────────────────────────────────────────

export interface AdminContext {
  user_id:     string;
  email:       string;
  admin_role:  AdminRole;
}

export type RequirePermissionResult =
  | { ok: true;  ctx: AdminContext }
  | { ok: false; status: 401 | 403; error: string };

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

  // Service-role to bypass profile-table RLS — the user might not be able
  // to SELECT their own profile row.
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
  //   - new admin_role column wins
  //   - fall back to binary `role='admin'` → super_admin (backward compat)
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

function isValidAdminRole(s: string): s is AdminRole {
  return s === "super_admin" || s === "admin" || s === "support_l2" || s === "support_l1" || s === "viewer";
}

// ── Convenience: build a 401/403 NextResponse from a failed gate ────────

export function permissionErrorResponse(
  r: Extract<RequirePermissionResult, { ok: false }>,
): NextResponse {
  return NextResponse.json({ error: r.error }, { status: r.status });
}

// ── Capture request context (IP, UA) for audit logs ────────────────────

export interface RequestContext {
  ip_address: string | null;
  user_agent: string | null;
}

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
