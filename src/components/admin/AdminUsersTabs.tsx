"use client";

/**
 * Tabbed wrapper for /admin/users — Jobs Users · Hire Users · Admins.
 *
 * The page partitions accounts in three buckets before passing them
 * down. Each panel sees only its own population. Tab labels show live
 * row counts per the spec.
 */

import { useState } from "react";
import { UsersAdminPanel,  type AdminUserRow } from "@/components/admin/UsersAdminPanel";
import { HireUsersAdminPanel, type HireUserRow }  from "@/components/admin/HireUsersAdminPanel";
import { AdminsAdminPanel,  type AdminUserRow as AdminsUserRow } from "@/components/admin/AdminsAdminPanel";

type Tab = "jobs" | "hire" | "admins";

interface Props {
  jobsUsers:   AdminUserRow[];
  hireUsers:   HireUserRow[];
  adminsUsers: AdminsUserRow[];
}

export function AdminUsersTabs({ jobsUsers, hireUsers, adminsUsers }: Props) {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        <TabButton active={tab === "jobs"}   onClick={() => setTab("jobs")}>
          Jobs Users <CountBadge>{jobsUsers.length}</CountBadge>
        </TabButton>
        <TabButton active={tab === "hire"}   onClick={() => setTab("hire")}>
          Hire Users <CountBadge>{hireUsers.length}</CountBadge>
        </TabButton>
        <TabButton active={tab === "admins"} onClick={() => setTab("admins")}>
          Admins <CountBadge>{adminsUsers.length}</CountBadge>
        </TabButton>
      </div>

      {tab === "jobs"  && <UsersAdminPanel      users={jobsUsers} hideAdminsTab />}
      {tab === "hire"  && <HireUsersAdminPanel  initialUsers={hireUsers} />}
      {tab === "admins" && <AdminsAdminPanel    initialUsers={adminsUsers} />}
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
