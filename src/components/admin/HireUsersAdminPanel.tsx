"use client";

/**
 * Hire Users admin panel — mirrors the Jobs Users (UsersAdminPanel) visual
 * system but lives on the employer side of the platform. Source data:
 *   GET /api/admin/hire-users
 * Actions:
 *   PATCH  /api/admin/hire-users/[id]/plan         — Free / Starter / Growth / Enterprise
 *   DELETE /api/admin/hire-users/[id]              — cascade delete
 *   POST   /api/admin/hire-users/[id]/reset-password
 *
 * Same admin gate as the Jobs side: server-side requirePermission on
 * every route, so no permission check is repeated here.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface HireUserRow {
  user_id:         string;
  email:           string | null;
  full_name:       string | null;
  company_name:    string | null;
  plan:            string;
  plan_status:     string;
  created_at:      string;
  email_confirmed: boolean;
}

export type HirePlan = "free" | "starter" | "growth" | "enterprise";

const PLAN_LABEL: Record<HirePlan, string> = {
  free:       "Free",
  starter:    "Starter — $49",
  growth:     "Growth — $149",
  enterprise: "Enterprise — $399",
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-purple-100 text-purple-700",
  growth:     "bg-indigo-100 text-indigo-700",
  enterprise: "bg-blue-100 text-blue-700",
};

interface Props {
  initialUsers: HireUserRow[];
}

export function HireUsersAdminPanel({ initialUsers }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<HireUserRow[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.company_name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  async function changePlan(uid: string, plan: HirePlan) {
    const u = users.find(x => x.user_id === uid);
    if (!u || u.plan === plan) return;
    if (!confirm(`Change ${u.email ?? uid} from ${u.plan} → ${plan}?`)) return;
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/admin/hire-users/${uid}/plan`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plan }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setUsers(prev => prev.map(x => x.user_id === uid ? { ...x, plan } : x));
        setBanner({ kind: "ok", text: `Plan updated to ${PLAN_LABEL[plan]}` });
      } catch (e) {
        setBanner({ kind: "err", text: e instanceof Error ? e.message : "Plan change failed" });
      }
    });
  }

  async function deleteUser(uid: string) {
    const u = users.find(x => x.user_id === uid);
    if (!u) return;
    if (!confirm(
      `⚠️  Permanently delete ${u.email ?? uid}?\n\n` +
      `This removes the employer account, company profile, invites, and all related data. ` +
      `It cannot be undone.`,
    )) return;
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/admin/hire-users/${uid}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setUsers(prev => prev.filter(x => x.user_id !== uid));
        setBanner({ kind: "ok", text: `Deleted ${u.email ?? uid}` });
        router.refresh();
      } catch (e) {
        setBanner({ kind: "err", text: e instanceof Error ? e.message : "Delete failed" });
      }
    });
  }

  async function resetPassword(uid: string) {
    const u = users.find(x => x.user_id === uid);
    if (!u) return;
    if (!confirm(`Send a password reset email to ${u.email ?? uid}?`)) return;
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/admin/hire-users/${uid}/reset-password`, { method: "POST" });
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
          placeholder="Search by email, name, or company…"
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
              {["Email", "Company", "Plan", "Joined", "Confirmed", "Actions"].map(h => (
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
                  {users.length === 0
                    ? "No hiring managers registered yet. When employers sign up at hire.icareeros.com they'll appear here."
                    : "No matches for that search."}
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <tr key={u.user_id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate font-medium text-gray-900">{u.email ?? "—"}</p>
                    {u.full_name && <p className="max-w-[220px] truncate text-xs text-gray-400">{u.full_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{u.company_name ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      onChange={e => changePlan(u.user_id, e.target.value as HirePlan)}
                      disabled={pending}
                      title="Change plan"
                      className={
                        "rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize " +
                        (PLAN_BADGE[u.plan] ?? PLAN_BADGE.free)
                      }
                    >
                      {(["free","starter","growth","enterprise"] as HirePlan[]).map(p => (
                        <option key={p} value={p}>{PLAN_LABEL[p]}</option>
                      ))}
                    </select>
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => resetPassword(u.user_id)}
                        disabled={pending}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => deleteUser(u.user_id)}
                        disabled={pending}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
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
