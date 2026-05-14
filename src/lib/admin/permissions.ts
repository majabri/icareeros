/**
 * Sprint 4 W1-B — Admin role + permission helper (CLIENT-SAFE module)
 *
 * 5-tier role model (admin_role column in public.profiles):
 *   super_admin > admin > support_l2 > support_l1 > viewer
 *
 * This file is safe to import from both client and server components.
 * Server-only helpers (requirePermission, readRequestContext) live in
 * `permissions.server.ts` to keep `next/headers` out of the client bundle.
 */

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

// ── Pure synchronous check ────────────────────────────────────────────────

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

export function isValidAdminRole(s: string | null | undefined): s is AdminRole {
  return s === "super_admin" || s === "admin" || s === "support_l2" || s === "support_l1" || s === "viewer";
}

// ── Shared context type (used by server helper) ─────────────────────────

export interface AdminContext {
  user_id:     string;
  email:       string;
  admin_role:  AdminRole;
}

export type RequirePermissionResult =
  | { ok: true;  ctx: AdminContext }
  | { ok: false; status: 401 | 403; error: string };

export interface RequestContext {
  ip_address: string | null;
  user_agent: string | null;
}
