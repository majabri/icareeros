"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string;
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { label: "Command Center", href: "/admin", icon: "⊞" },
    ],
  },
  {
    group: "User Management",
    items: [
      { label: "Users", href: "/admin/users", icon: "👥" },
      { label: "Support Inbox", href: "/admin/tickets", icon: "🎫" },
    ],
  },
  {
    group: "AI & Automation",
    items: [
      { label: "The Crew Status", href: "/admin/agents", icon: "🤖", badge: "soon" },
      { label: "Agent Runs",      href: "/admin/agent-runs", icon: "⚡", badge: "soon" },
      { label: "Queue",           href: "/admin/queue", icon: "📋", badge: "soon" },
    ],
  },
  {
    group: "System & Monitoring",
    items: [
      { label: "System Monitor", href: "/admin/system", icon: "🛡" },
      { label: "Console",        href: "/admin/console", icon: "⌨" },
      { label: "Event Log",      href: "/admin/logs", icon: "📜", badge: "soon" },
      { label: "Audit Log",      href: "/admin/audit", icon: "📋", badge: "soon" },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Feature Flags", href: "/admin/flags", icon: "🚩" },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Settings",  href: "/admin/settings", icon: "⚙️", badge: "soon" },
      { label: "My Profile", href: "/admin/profile", icon: "👤", badge: "soon" },
    ],
  },
];

export default function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  async function handleSignOut() {
    await supabase.auth.signOut().catch(() => {});
    router.push("/auth/login");
  }

  return (
    <aside
      className={`flex flex-col bg-gray-900 text-gray-100 transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      } min-h-screen flex-shrink-0`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2 px-3 py-5 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-8 h-8 bg-red-600/80 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">A</span>
        </div>
        {!collapsed && (
          <span className="font-bold text-white tracking-tight">Admin</span>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto text-gray-500 hover:text-white transition-colors text-xs"
            aria-label="Collapse sidebar"
          >◀</button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mb-2 text-gray-500 hover:text-white text-xs"
          aria-label="Expand sidebar"
        >▶</button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map(({ group, items }) => (
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
          <p className="px-2 pt-1 text-[10px] text-gray-600">iCareerOS Admin</p>
        )}
      </div>
    </aside>
  );
}
