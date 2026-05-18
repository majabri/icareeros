"use client";

/**
 * Tabbed wrapper for /admin/users — renders the existing UsersAdminPanel
 * (Jobs Users) and the new HireUsersAdminPanel (Hire Users) side by side.
 *
 * The page partitions by user_roles.role before passing each list down,
 * so each panel sees only its own population. The tab label shows a
 * live row-count badge per the spec.
 */

import { useState } from "react";
import { UsersAdminPanel, type AdminUserRow } from "@/components/admin/UsersAdminPanel";
import { HireUsersAdminPanel, type HireUserRow } from "@/components/admin/HireUsersAdminPanel";

type Tab = "jobs" | "hire";

interface Props {
  jobsUsers: AdminUserRow[];
  hireUsers: HireUserRow[];
}

export function AdminUsersTabs({ jobsUsers, hireUsers }: Props) {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")}>
          Jobs Users <CountBadge>{jobsUsers.length}</CountBadge>
        </TabButton>
        <TabButton active={tab === "hire"} onClick={() => setTab("hire")}>
          Hire Users <CountBadge>{hireUsers.length}</CountBadge>
        </TabButton>
      </div>

      {tab === "jobs" ? (
        <UsersAdminPanel users={jobsUsers} />
      ) : (
        <HireUsersAdminPanel initialUsers={hireUsers} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " +
        (active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-gray-500 hover:text-gray-700")
      }
    >
      {children}
    </button>
  );
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-xs text-gray-400">({children})</span>;
}
