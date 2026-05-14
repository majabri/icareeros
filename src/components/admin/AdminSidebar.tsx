"use client";

/**
 * Sprint 4 W2-A — Admin sidebar
 *
 * Changes from pre-Sprint-4:
 *   • Accepts `adminRole` prop (5-tier from W1) — filters NAV items
 *     using hasPermission() so a `viewer` doesn't see flag toggles.
 *   • Mobile drawer: < md hides the persistent aside and shows a
 *     hamburger button in the topbar (rendered by layout.tsx).
 *     `isOpen` / `onClose` props control the drawer state.
 *   • `soon` badges retained for stubs that aren't built yet
 *     (sidebar items the user explicitly chose to keep).
 */

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { hasPermission, type AdminRole, type Permission } from "@/lib/admin/permissions";

interface NavItem {
  label:       string;
  href:        string;
  icon:        string;
  /** When provided, the item is only shown if the role passes this check. */
  permission?: Permission;
  badge?:      string;
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { label: "Command Center", href: "/admin", icon: "⊞", permission: "system.view_metrics" },
    ],
  },
  {
    group: "User Management",
    items: [
      { label: "Users",         href: "/admin/users",   icon: "👥", permission: "users.view_list" },
      { label: "Support Inbox", href: "/admin/tickets", icon: "🎫", permission: "support.view_tickets" },
    ],
  },
  {
    group: "AI & Automation",
    items: [
      { label: "The Crew Status", href: "/admin/agents",     icon: "🤖", permission: "system.view_metrics", badge: "soon" },
      { label: "Agent Runs",      href: "/admin/agent-runs", icon: "⚡", permission: "system.view_metrics", badge: "soon" },
      { label: "Queue",           href: "/admin/queue",      icon: "📋", permission: "system.view_metrics", badge: "soon" },
    ],
  },
  {
    group: "System & Monitoring",
    items: [
      { label: "System Monitor", href: "/admin/system",  icon: "🛡", permission: "system.view_metrics" },
      { label: "Console",        href: "/admin/console", icon: "⌨",  permission: "system.run_console_cmd" },
      { label: "Event Log",      href: "/admin/logs",    icon: "📜", permission: "system.view_metrics", badge: "soon" },
      { label: "Audit Log",      href: "/admin/audit",   icon: "📋", permission: "audit.view" },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Feature Flags",  href: "/admin/flags",         icon: "🚩", permission: "system.toggle_flags" },
      { label: "Opportunities",  href: "/admin/opportunities", icon: "💼", permission: "opportunities.view" },
      { label: "Role Management", href: "/admin/roles",        icon: "🔑", permission: "roles.assign" },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Settings",   href: "/admin/settings", icon: "⚙️",  permission: "system.view_metrics", badge: "soon" },
      { label: "My Profile", href: "/admin/profile",  icon: "👤", permission: "system.view_metrics", badge: "soon" },
    ],
  },
];

export interface AdminSidebarProps {
  adminRole:  AdminRole;
  /** Mobile drawer state — controlled by the parent layout. Desktop ignores. */
  isOpen?:    boolean;
  onClose?:   () => void;
}

export default function AdminSidebar({ adminRole, isOpen = false, onClose }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Close drawer on route change (mobile)
  useEffect(() => { onClose?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  async function handleSignOut() {
    await supabase.auth.signOut().catch(() => {});
    router.push("/auth/login");
  }

  // Filter NAV by permission so users only see what they can access
  const visibleNav = NAV
    .map(g => ({ ...g, items: g.items.filter(it => !it.permission || hasPermission(adminRole, it.permission)) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          flex flex-col bg-gray-900 text-gray-100 transition-all duration-200 flex-shrink-0
          ${collapsed ? "md:w-14" : "md:w-56"}
          fixed inset-y-0 left-0 z-50 w-64 transform
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:min-h-screen
        `}
        aria-label="Admin navigation"
      >
        {/* Logo */}
        <div className={`flex items-center gap-2 px-3 py-5 ${collapsed ? "md:justify-center" : ""}`}>
          <div className="w-8 h-8 bg-red-600/80 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          {!collapsed && <span className="font-bold text-white tracking-tight">Admin</span>}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="ml-auto text-gray-500 hover:text-white transition-colors text-xs hidden md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-white transition-colors md:hidden"
            aria-label="Close menu"
          >✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {visibleNav.map(({ group, items }) => (
            <div key={group} className="mt-4">
              {!collapsed && (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {group}
                </p>
              )}
              {items.map(({ label, href, icon, badge }) => {
                const active = isActive(href);
                const isSoon = badge === "soon";
                return (
                  <button
                    key={href}
                    onClick={() => !isSoon && router.push(href)}
                    title={collapsed ? label : undefined}
                    disabled={isSoon}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors mb-0.5
                      ${active
                        ? "bg-red-700/30 text-red-300 border-l-2 border-red-400 pl-[6px]"
                        : isSoon
                          ? "text-gray-600 cursor-default"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      }`}
                  >
                    <span className="text-base leading-none flex-shrink-0">{icon}</span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left truncate">{label}</span>
                        {badge && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-500 uppercase tracking-wide">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-gray-800 space-y-1">
          <button
            onClick={() => router.push("/dashboard")}
            title={collapsed ? "Back to App" : undefined}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span className="text-base leading-none">←</span>
            {!collapsed && <span>Back to App</span>}
          </button>
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign Out" : undefined}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-400/70 hover:bg-red-900/20 hover:text-red-300 transition-colors"
          >
            <span className="text-base leading-none">↪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
          {!collapsed && (
            <p className="px-2 pt-1 text-[10px] text-gray-600">iCareerOS Admin · {adminRole}</p>
          )}
        </div>
      </aside>
    </>
  );
}
