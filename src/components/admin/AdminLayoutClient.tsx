"use client";

/**
 * Sprint 4 W4 (layout parity) — Admin client-side shell.
 *
 * Mirrors `(app)/layout.tsx` exactly:
 *   • ConstellationBackground fixed behind everything
 *   • AdminTopBar (visually identical to AppTopBar; only adds a centered
 *     red "Admin Mode" + role badge cluster in the middle of the bar)
 *   • AdminSidebar (white-themed, sticky below the 72px topbar, same item
 *     styling as AppSidebar)
 *   • main with paddingTop:72 + minHeight:100vh
 *
 * The previous W2-A shell rendered a dark, separate-looking chrome. That
 * was replaced 2026-05-14 because the admin view should feel like the
 * same product, not a different application.
 */

import { useState } from "react";
import { ConstellationBackground } from "@/components/ConstellationBackground";
import { AdminTopBar }              from "@/components/admin/AdminTopBar";
import AdminSidebar                 from "@/components/admin/AdminSidebar";
import type { AdminRole }           from "@/lib/admin/permissions";

const TOP_BAR_H = 72; // px — must match AdminTopBar height

// Note: adminEmail is read inside AdminTopBar from supabase.auth.getUser()
// so we no longer thread it as a prop. We keep the field optional to
// preserve the existing server-component contract while we phase that out.
export interface AdminLayoutClientProps {
  adminEmail?: string;
  adminRole:   AdminRole;
  children:    React.ReactNode;
}

export default function AdminLayoutClient({
  adminRole,
  children,
}: AdminLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Constellation: fixed behind everything ─────────────────── */}
      <ConstellationBackground />

      {/* ── All app chrome sits above the constellation ─────────────── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Persistent top bar with center-aligned admin indicator */}
        <AdminTopBar
          adminRole={adminRole}
          onMenuClick={() => setMobileOpen(true)}
        />

        {/* Sidebar + page content, pushed below the top bar */}
        <div
          className="flex"
          style={{ paddingTop: TOP_BAR_H, minHeight: "100vh" }}
        >
          <AdminSidebar
            adminRole={adminRole}
            isOpen={mobileOpen}
            onClose={() => setMobileOpen(false)}
          />
          <main
            id="admin-main-content"
            tabIndex={-1}
            className="flex-1 min-w-0 outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
