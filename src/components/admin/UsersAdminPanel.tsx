"use client";

import { useState, useMemo, useTransition } from "react";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import {
  deleteUsers,
  setUsersPlan,
  setUsersRole,
} from "@/app/actions/adminActions";
import type { UserRole, SubscriptionPlan } from "@/app/actions/adminActions";

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  plan: SubscriptionPlan;
  plan_status: string;
  cycle_count: number;
  email_confirmed: boolean;
}

interface Props {
  users: AdminUserRow[];
}

type Tab = "users" | "admins";

function planBadgeClass(plan: string) {
  if (plan === "premium") return "bg-purple-100 text-purple-700";
  if (plan === "pro") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function roleBadgeClass(role: string) {
  if (role === "admin") return "bg-red-100 text-red-700";
  if (role === "moderator") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export function UsersAdminPanel({ users }: Props) {
  const [tab, setTab] = useState<Tab>("users");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    | { kind: "ok"; text: string }
    | { kind: "err"; text: string }
    | null
  >(null);

  const usersList = useMemo(
    () => users.filter((u) => u.role === "user"),
    [users]
  );
  const adminsList = useMemo(
    () => users.filter((u) => u.role === "admin" || u.role === "moderator"),
    [users]
  );

  const visibleList = tab === "users" ? usersList : adminsList;
  const visibleIds = useMemo(
    () => new Set(visibleList.map((u) => u.user_id)),
    [visibleList]
  );

  const visibleSelected = useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds]
  );
  const allVisibleSelected =
    visibleList.length > 0 && visibleSelected.size === visibleList.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function switchTab(t: Tab) {
    setTab(t);
    clearSelection();
    setBanner(null);
  }

  function handleBulkDelete() {
    const ids = [...visibleSelected];
    if (ids.length === 0) return;
    if (
      !confirm(
        "Permanently delete " + ids.length + " user" + (ids.length === 1 ? "" : "s") + "?\n\n" +
          "This removes their account, subscription, profile, cycles, and all related data. " +
          "It cannot be undone.\n\n" +
          "Click OK to confirm."
      )
    )
      return;

    startTransition(async () => {
      const res = await deleteUsers(ids);
      const okCount = res.succeeded.length;
      const failCount = res.failed.length;
      if (failCount === 0) {
        setBanner({ kind: "ok", text: "Deleted " + okCount + " user" + (okCount === 1 ? "" : "s") + "." });
      } else {
        setBanner({
          kind: "err",
          text: "Deleted " + okCount + ", failed " + failCount + ". " + (res.failed[0]?.error ?? ""),
        });
      }
      clearSelection();
    });
  }

  function handleBulkPlan(plan: SubscriptionPlan) {
    const ids = [...visibleSelected];
    if (ids.length === 0) return;
    if (
      !confirm(
        "Change " + ids.length + " user" + (ids.length === 1 ? "" : "s") + " to " + plan + "?"
      )
    )
      return;

    startTransition(async () => {
      const res = await setUsersPlan(ids, plan);
      const okCount = res.succeeded.length;
      const failCount = res.failed.length;
      setBanner({
        kind: failCount === 0 ? "ok" : "err",
        text: "Plan updated for " + okCount + (failCount > 0 ? "; failed " + failCount : "") + ".",
      });
      clearSelection();
    });
  }

  function handleBulkRole(role: UserRole) {
    const ids = [...visibleSelected];
    if (ids.length === 0) return;

    let confirmText: string;
    if (role === "admin") confirmText = "Promote " + ids.length + " to Admin?";
    else if (role === "moderator") confirmText = "Set " + ids.length + " as Moderator?";
    else confirmText = "Demote " + ids.length + " to User (regular)?";

    if (!confirm(confirmText)) return;

    startTransition(async () => {
      const res = await setUsersRole(ids, role);
      const okCount = res.succeeded.length;
      const failCount = res.failed.length;
      setBanner({
        kind: failCount === 0 ? "ok" : "err",
        text:
          "Role updated for " + okCount +
          (failCount > 0 ? "; failed " + failCount + " (" + (res.failed[0]?.error ?? "") + ")" : ""),
      });
      clearSelection();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => switchTab("users")}
          className={
            "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " +
            (tab === "users"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          Users <span className="ml-1 text-xs text-gray-400">({usersList.length})</span>
        </button>
        <button
          onClick={() => switchTab("admins")}
          className={
            "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " +
            (tab === "admins"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          Admins <span className="ml-1 text-xs text-gray-400">({adminsList.length})</span>
        </button>
      </div>

      {banner && (
        <div
          className={
            "mb-3 rounded-md px-3 py-2 text-sm " +
            (banner.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200")
          }
        >
          {banner.text}
        </div>
      )}

      {visibleSelected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium text-blue-900">
            {visibleSelected.size} selected
          </span>
          <span className="text-blue-300">·</span>

          <button
            onClick={handleBulkDelete}
            disabled={pending}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Delete {visibleSelected.size}
          </button>

          <PlanDropdown disabled={pending} onPick={handleBulkPlan} />

          {tab === "users" ? (
            <>
              <button
                onClick={() => handleBulkRole("admin")}
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Promote to Admin
              </button>
              <button
                onClick={() => handleBulkRole("moderator")}
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Promote to Moderator
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleBulkRole("admin")}
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Set Admin
              </button>
              <button
                onClick={() => handleBulkRole("moderator")}
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Set Moderator
              </button>
              <button
                onClick={() => handleBulkRole("user")}
                disabled={pending}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Demote to User
              </button>
            </>
          )}

          <button
            onClick={clearSelection}
            disabled={pending}
            className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label={"Select all " + tab}
                />
              </th>
              {["User", "Role", "Plan", "Cycles", "Joined", "Supabase", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleList.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No {tab === "users" ? "users" : "admins"} yet.
                </td>
              </tr>
            ) : (
              visibleList.map((u) => {
                const checked = selected.has(u.user_id);
                return (
                  <tr
                    key={u.user_id}
                    className={
                      "transition-colors hover:bg-gray-50 " +
                      (checked ? "bg-blue-50/40" : "")
                    }
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(u.user_id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={"Select " + (u.email ?? u.user_id)}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <p className="max-w-[180px] truncate font-medium text-gray-900">
                        {u.email ?? "—"}
                      </p>
                      {u.full_name && (
                        <p className="max-w-[180px] truncate text-xs text-gray-400">
                          {u.full_name}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize " +
                          roleBadgeClass(u.role)
                        }
                      >
                        {u.role}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                          planBadgeClass(u.plan)
                        }
                      >
                        {u.plan}
                      </span>
                      {u.plan_status !== "active" && (
                        <span className="ml-1 text-xs text-red-400">{u.plan_status}</span>
                      )}
                    </td>

                    <td className="px-4 py-3 tabular-nums text-gray-600">{u.cycle_count}</td>

                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={"https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/users?search=" + (u.email ?? u.user_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                      >
                        View ↗
                      </a>
                    </td>

                    <td className="px-4 py-3">
                      <AdminUserActions
                        userId={u.user_id}
                        currentPlan={u.plan}
                        currentRole={u.role}
                        email={u.email ?? u.user_id}
                        emailConfirmed={u.email_confirmed}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanDropdown({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (plan: SubscriptionPlan) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Change plan ▾
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-32 rounded-md border border-gray-200 bg-white shadow-lg">
          {(["free", "pro", "premium"] as SubscriptionPlan[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setOpen(false);
                onPick(p);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium capitalize text-gray-700 hover:bg-gray-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
