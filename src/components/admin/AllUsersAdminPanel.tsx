"use client";

/**
 * "All Users" panel — fourth tab on /admin/users.
 *
 * READ-ONLY combined overview. Columns: Email · Role · Plan · Joined · Confirmed.
 * Per-row actions intentionally live in the specialized tabs (Jobs Users,
 * Hire Users, Admins) — this tab is for at-a-glance triage only.
 */

import { useMemo, useState } from "react";

export type RoleBadge = "Jobs User" | "Hire User" | "Admin";

export interface AllUserRow {
  user_id:         string;
  email:           string | null;
  role_badge:      RoleBadge;
  plan:            string;
  created_at:      string;
  email_confirmed: boolean;
}

const ROLE_BADGE_STYLE: Record<RoleBadge, string> = {
  "Jobs User": "bg-emerald-100 text-emerald-700",
  "Hire User": "bg-indigo-100 text-indigo-700",
  "Admin":     "bg-red-100 text-red-700",
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-purple-100 text-purple-700",
  standard:   "bg-indigo-100 text-indigo-700",
  pro:        "bg-blue-100 text-blue-700",
  growth:     "bg-indigo-100 text-indigo-700",
  enterprise: "bg-blue-100 text-blue-700",
  premium:    "bg-blue-100 text-blue-700",
  "—":        "bg-gray-50 text-gray-400",
};

interface Props {
  initialUsers: AllUserRow[];
}

export function AllUsersAdminPanel({ initialUsers }: Props) {
  const [users] = useState<AllUserRow[]>(initialUsers);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email ?? "").toLowerCase().includes(q) ||
      u.role_badge.toLowerCase().includes(q) ||
      u.plan.toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by email, role, or plan…"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="shrink-0 text-xs text-gray-500">
          {filtered.length} of {users.length}
        </span>
      </div>

      <p className="mb-3 text-xs text-gray-400">
        Read-only overview. Use the Jobs Users, Hire Users, or Admins tab for per-row actions.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Email", "Role", "Plan", "Joined", "Confirmed"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  {users.length === 0
                    ? "No users yet."
                    : "No matches for that search."}
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <tr key={u.user_id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="max-w-[280px] truncate font-medium text-gray-900">{u.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                        ROLE_BADGE_STYLE[u.role_badge]
                      }
                    >
                      {u.role_badge}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize " +
                        (PLAN_BADGE[u.plan] ?? PLAN_BADGE.free)
                      }
                    >
                      {u.plan}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
