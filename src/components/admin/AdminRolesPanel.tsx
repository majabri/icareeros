"use client";

/**
 * Sprint 4 W3-G — Role management client panel.
 *
 * Renders the admin roster and lets a super_admin change each user's
 * admin_role. The current user's row is rendered read-only (matches the
 * API's "you can't change your own role" rule). The "last super_admin"
 * guard greys out non-super_admin choices on the last super_admin's row.
 *
 * Every change goes through a confirmation dialog so a misclick doesn't
 * silently elevate someone.
 */

import { useState } from "react";
import AdminTable from "@/components/admin/ui/AdminTable";
import AdminConfirmDialog from "@/components/admin/ui/AdminConfirmDialog";
import type { AdminRole } from "@/lib/admin/permissions";
import { ROLE_HIERARCHY } from "@/lib/admin/permissions";

export interface AdminRoleRow {
  user_id:     string;
  email:       string;
  full_name:   string | null;
  legacy_role: string | null;
  admin_role:  AdminRole | null;
  created_at:  string;
  is_self:     boolean;
}

export interface AdminRolesPanelProps {
  rows:             AdminRoleRow[];
  /**
   * Initial super_admin count from the server. Not currently used in the
   * panel body — `liveSA` is recomputed from `rows` + `optimistic` on every
   * render so it stays correct after a promotion. Kept on the interface so
   * the page-level contract is explicit and so future logging / telemetry
   * has access.
   */
  superAdminCount:  number;
  /**
   * Caller's user_id. Not used in the body — `row.is_self` (computed
   * server-side) drives the read-only-self UI. Kept on the interface for
   * the same reason as above.
   */
  currentUserId:    string;
  currentUserEmail: string;
}

const ROLE_OPTIONS: Array<{ value: AdminRole | "none"; label: string }> = [
  { value: "super_admin", label: "super_admin (full system access)" },
  { value: "admin",       label: "admin (everything except role assignment, refunds, console)" },
  { value: "support_l2",  label: "support_l2 (plan changes, billing view)" },
  { value: "support_l1",  label: "support_l1 (tickets only)" },
  { value: "viewer",      label: "viewer (read-only metrics)" },
  { value: "none",        label: "none (revoke admin access)" },
];

const ROLE_BADGE: Record<AdminRole, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  admin:       "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200",
  support_l2:  "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  support_l1:  "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  viewer:      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminRolesPanel({
  rows,
  currentUserEmail,
}: AdminRolesPanelProps) {
  const [pending, setPending]   = useState<string | null>(null);  // row user_id currently mutating
  const [confirming, setConfirming] = useState<null | {
    user_id:     string;
    email:       string;
    fromRole:    AdminRole | null;
    toRole:      AdminRole | null;
    isElevation: boolean;
    isLastSuperAdmin: boolean;
  }>(null);
  const [error, setError]       = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, AdminRole | null>>({});

  function effectiveRoleFor(row: AdminRoleRow): AdminRole | null {
    return row.user_id in optimistic ? optimistic[row.user_id] : row.admin_role;
  }

  function requestChange(row: AdminRoleRow, nextValue: AdminRole | "none") {
    setError(null);
    const current = effectiveRoleFor(row);
    const next: AdminRole | null = nextValue === "none" ? null : nextValue;
    if (next === current) return;

    // Compute the effective live super_admin count, accounting for optimistic
    // updates so successive demotions cascade correctly (e.g. if you just
    // promoted someone, the count includes them on the next change).
    const liveSuperAdmins = rows.filter(rr => {
      const rEffective = rr.user_id in optimistic ? optimistic[rr.user_id] : rr.admin_role;
      return rEffective === "super_admin";
    }).length;
    const isLastSA = current === "super_admin" && liveSuperAdmins <= 1;

    setConfirming({
      user_id:           row.user_id,
      email:             row.email,
      fromRole:          current,
      toRole:            next,
      isElevation:       (next ? ROLE_HIERARCHY[next] : 0) > (current ? ROLE_HIERARCHY[current] : 0),
      isLastSuperAdmin:  isLastSA,
    });
  }

  async function doUpdate() {
    if (!confirming) return;
    const { user_id, toRole } = confirming;
    setPending(user_id);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id, admin_role: toRole }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        setError(j.error ?? `HTTP ${res.status} — role update failed`);
        return;
      }
      setOptimistic(o => ({ ...o, [user_id]: toRole }));
      setConfirming(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          <strong>Couldn't update role:</strong> {error}
        </div>
      )}

      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        <strong>Safety notes.</strong> You're signed in as <code className="font-mono">{currentUserEmail}</code>. You cannot change your own role; ask another super_admin. The system always keeps at least one super_admin — the dropdown will block demoting the last one.
      </div>

      <AdminTable
        rows={rows}
        rowKey={r => r.user_id}
        columns={[
          { key: "user", label: "User", render: r => (
            <div className="text-sm">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[260px]">
                {r.email}
                {r.is_self && <span className="ml-2 text-[10px] uppercase tracking-wider text-brand-600 dark:text-brand-300">you</span>}
              </div>
              {r.full_name && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">{r.full_name}</div>
              )}
            </div>
          )},
          { key: "current", label: "Current role", className: "whitespace-nowrap", render: r => {
            const role = effectiveRoleFor(r);
            return role ? (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
                {role}
              </span>
            ) : (
              <span className="text-xs text-gray-400">none</span>
            );
          }},
          { key: "legacy", label: "Legacy flag", className: "whitespace-nowrap", render: r => (
            r.legacy_role ? <code className="text-[10px] text-gray-500 dark:text-gray-400">{r.legacy_role}</code> : <span className="text-xs text-gray-400">—</span>
          )},
          { key: "created", label: "Since", className: "whitespace-nowrap text-xs", render: r => (
            <span title={r.created_at}>{timeAgo(r.created_at)}</span>
          )},
          { key: "action", label: "Change role", render: r => {
            const role = effectiveRoleFor(r);
            const currentValue: AdminRole | "none" = role ?? "none";
            // Use the optimistic-aware live count so re-renders after a successful
            // promotion update the "last super_admin" guard immediately.
            const liveSA = rows.filter(rr => {
              const eff = rr.user_id in optimistic ? optimistic[rr.user_id] : rr.admin_role;
              return eff === "super_admin";
            }).length;
            const isLastSA = role === "super_admin" && liveSA <= 1;
            const disabled = r.is_self || pending === r.user_id;
            return (
              <select
                value={currentValue}
                disabled={disabled}
                onChange={e => requestChange(r, e.target.value as AdminRole | "none")}
                aria-label={`Change role for ${r.email}`}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-600"
              >
                {ROLE_OPTIONS.map(opt => {
                  // Disable demotions of the last super_admin
                  const disableLastSA = isLastSA && opt.value !== "super_admin";
                  return (
                    <option key={opt.value} value={opt.value} disabled={disableLastSA}>
                      {opt.label}{disableLastSA ? " — blocked: last super_admin" : ""}
                    </option>
                  );
                })}
              </select>
            );
          }},
        ]}
      />

      <AdminConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={doUpdate}
        title={
          confirming?.toRole === null
            ? "Revoke admin access?"
            : confirming?.isElevation
              ? `Promote to ${confirming?.toRole}?`
              : `Change role to ${confirming?.toRole}?`
        }
        description={
          confirming ? (
            <div className="space-y-2">
              <p>
                <code className="font-mono text-xs">{confirming.email}</code> will move from{" "}
                <strong>{confirming.fromRole ?? "no admin role"}</strong> to <strong>{confirming.toRole ?? "no admin role"}</strong>.
              </p>
              {confirming.toRole === null && (
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  This revokes all admin access. Legacy role flag is also cleared. They'll keep their regular user account.
                </p>
              )}
              {confirming.toRole === "super_admin" && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  super_admin has full system access — including role assignment, refunds, and the admin console.
                </p>
              )}
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Audited as <code className="font-mono">{confirming.toRole === null ? "roles.cleared" : "roles.assigned"}</code>.
              </p>
            </div>
          ) : null
        }
        confirmLabel={confirming?.toRole === null ? "Revoke access" : "Confirm change"}
        destructive={confirming?.toRole === null || (!confirming?.isElevation && confirming?.fromRole === "super_admin")}
      />
    </div>
  );
}
