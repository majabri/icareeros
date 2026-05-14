"use client";

/**
 * Sprint 4 W2-A — Admin client-side layout shell
 *
 * Wraps the server-side layout with state for the mobile drawer +
 * topbar with email + role badge + hamburger toggle.
 */

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import type { AdminRole } from "@/lib/admin/permissions";

const ROLE_BADGE_CLASS: Record<AdminRole, string> = {
  super_admin: "bg-red-500/15 text-red-700 ring-1 ring-red-500/40 dark:text-red-300",
  admin:       "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/40 dark:text-amber-300",
  support_l2:  "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/40 dark:text-blue-300",
  support_l1:  "bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/40 dark:text-sky-300",
  viewer:      "bg-gray-500/15 text-gray-700 ring-1 ring-gray-500/40 dark:text-gray-300",
};

const ROLE_DISPLAY: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin:       "Admin",
  support_l2:  "Support L2",
  support_l1:  "Support L1",
  viewer:      "Viewer",
};

export interface AdminLayoutClientProps {
  adminEmail: string;
  adminRole:  AdminRole;
  children:   React.ReactNode;
}

export default function AdminLayoutClient({ adminEmail, adminRole, children }: AdminLayoutClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-[var(--surface-page,#0f1b2d)]">
      <AdminSidebar
        adminRole={adminRole}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 flex items-center gap-3 border-b border-gray-200 bg-white/90 backdrop-blur-sm sticky top-0 z-30 px-4 dark:bg-[var(--surface-card,#162338)]/90 dark:border-[var(--surface-border,#243653)]">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden -ml-1 p-2 rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6"  x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
            ⚠ Admin Mode
          </span>

          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASS[adminRole]}`}
            title={`Role: ${adminRole}`}
          >
            {ROLE_DISPLAY[adminRole]}
          </span>

          <span className="ml-auto text-xs text-gray-400 font-mono truncate max-w-[60%]" title={adminEmail}>
            {adminEmail}
          </span>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
