"use client";

/**
 * Admins panel — third tab on /admin/users.
 *
 * Shows users with admin privileges (profiles.admin_role IS NOT NULL OR
 * legacy profiles.role = 'admin'). Action set is intentionally narrow:
 * just "Send password reset". Plan changes don't apply to admins; delete
 * is excluded as a safety rail — admin deletion still lives in the
 * super-admin-only Roles management surface.
 */

import { useMemo, useState, useTransition } from "react";

export interface AdminUserRow {
  user_id:         string;
  email:           string | null;
  full_name:       string | null;
  admin_role:      string;
  created_at:      string;
  email_confirmed: boolean;
}

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  admin:       "bg-rose-100 text-rose-700",
  support_l2:  "bg-orange-100 text-orange-700",
  support_l1:  "bg-amber-100 text-amber-700",
  viewer:      "bg-gray-100 text-gray-600",
};

interface Props {
  initialUsers: AdminUserRow[];
}

export function AdminsAdminPanel({ initialUsers }: Props) {
  const [users] = useState<AdminUserRow[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q) ||
      u.admin_role.toLowerCase().includes(q),
    );
  }, [users, query]);

  async function resetPassword(uid: string) {
    const u = users.find(x => x.user_id === uid);
    if (!u) return;
    if (!confirm(`Send a password reset email to ${u.email ?? uid}?`)) return;
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/admin/admin-users/${uid}/reset-password`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setBanner({ kind: "ok", text: `Reset email sent to ${u.email ?? uid}` });
      } catch (e) {
        setBanner({ kind: "err", text: e instanceof Error ? e.message : "Send failed" });
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by email, name, or role…"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="shrink-0 text-xs text-gray-500">
          {filtered.length} of {users.length}
        </span>
      </div>

      {banner && (
        <div
          role={banner.kind === "err" ? "alert" : "status"}
          className={
            "mb-3 rounded-md px-3 py-2 text-sm border " +
            (banner.kind === "ok"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200")
          }
        >
          {banner.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Email", "Name", "Role", "Joined", "Confirmed", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  {users.length === 0 ? "No admin users found." : "No matches for that search."}
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <tr key={u.user_id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="max-w-[240px] truncate font-medium text-gray-900">{u.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{u.full_name ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                        (ROLE_BADGE[u.admin_role] ?? ROLE_BADGE.viewer)
                      }
                    >
                      {u.admin_role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-500">
                    {new Date(u.created_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    {u.email_confirmed ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        ✓ Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => resetPassword(u.user_id)}
                      disabled={pending}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
