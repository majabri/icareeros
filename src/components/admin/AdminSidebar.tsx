"use client";

/**
 * Sprint 4 W4 (layout parity) — Admin Sidebar.
 *
 * Visually identical to AppSidebar: white background, gray-200 border-r,
 * shadow-sm, sticky below the 72px topbar, 224px expanded / 64px collapsed,
 * brand-50 active-row tint, same SVG-stroke icons, same item spacing. The
 * ONLY admin-specific behavior is permission filtering — items the current
 * adminRole can't access don't appear.
 *
 * Replaces the dark-shell version from W2-A. We chose visual parity over
 * darker-equals-admin theming because the job-seeker app already has a
 * mature visual language and a separate-looking shell felt jarring.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { hasPermission, type AdminRole, type Permission } from "@/lib/admin/permissions";

// ── SVG icons (mirrors AppSidebar's `Ic` component) ──────────────────────────
const Ic = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className="shrink-0"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  command:   "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  users:     "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  ticket:    "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z M14 5v14",
  monitor:   "M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  console:   "M8 9l3 3-3 3 M13 15h3 M3 4h18v16H3z",
  audit:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  flag:      "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22V15",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  key:       "M21 2l-9.6 9.6 M15.5 7.5l3 3L22 7l-3-3 M11.4 11.6a5 5 0 1 1-7 7 5 5 0 0 1 7-7z",
  menu:      "M3 12h18 M3 6h18 M3 18h18",
  close:     "M18 6L6 18 M6 6l12 12",
  back:      "M19 12H5 M12 19l-7-7 7-7",
  signout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
} as const;

type IconKey = keyof typeof ICONS;

interface NavItem {
  label:       string;
  href:        string;
  icon:        IconKey;
  permission?: Permission;
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { label: "Command Center", href: "/admin", icon: "command", permission: "system.view_metrics" },
    ],
  },
  {
    group: "User Management",
    items: [
      { label: "Users",         href: "/admin/users",   icon: "users",  permission: "users.view_list" },
      { label: "Support Inbox", href: "/admin/tickets", icon: "ticket", permission: "support.view_tickets" },
    ],
  },
  {
    group: "System & Monitoring",
    items: [
      { label: "System Monitor", href: "/admin/system",  icon: "monitor", permission: "system.view_metrics" },
      { label: "Console",        href: "/admin/console", icon: "console", permission: "system.run_console_cmd" },
      { label: "Audit Log",      href: "/admin/audit",   icon: "audit",   permission: "audit.view" },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Feature Flags",   href: "/admin/flags",         icon: "flag",      permission: "system.toggle_flags" },
      { label: "Opportunities",   href: "/admin/opportunities", icon: "briefcase", permission: "opportunities.view" },
      { label: "Role Management", href: "/admin/roles",         icon: "key",       permission: "roles.assign" },
    ],
  },
];

export interface AdminSidebarProps {
  adminRole:  AdminRole;
  /** Mobile drawer state — controlled by the parent layout. */
  isOpen?:    boolean;
  onClose?:   () => void;
}

export default function AdminSidebar({ adminRole, isOpen = false, onClose }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router   = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Close drawer on route change (mobile)
  useEffect(() => { onClose?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  async function handleSignOut() {
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "https://icareeros.com/";
  }

  const visibleNav = NAV
    .map(g => ({ ...g, items: g.items.filter(it => !it.permission || hasPermission(adminRole, it.permission)) }))
    .filter(g => g.items.length > 0);

  // ── Shared nav body ─────────────────────────────────────────────────────
  function NavContent({ mobile = false }: { mobile?: boolean }) {
    const show = !collapsed || mobile;

    return (
      <>
        {/* Collapse toggle — desktop only */}
        {!mobile && (
          <div className="flex h-10 items-center justify-end px-3 border-b border-gray-100 shrink-0">
            <button
              onClick={() => setCollapsed(c => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
            >
              <Ic d={ICONS.menu} size={16} />
            </button>
          </div>
        )}

        {/* Mobile drawer header */}
        {mobile && (
          <div className="flex h-14 items-center justify-between px-4 border-b border-gray-100 shrink-0">
            <span style={{
              fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              iCareerOS · Admin
            </span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Ic d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        {/* Scrollable nav */}
        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto py-2 px-2">
          {visibleNav.map(({ group, items }) => (
            <div key={group} className="mb-3">
              {show && (
                <p className="px-3 mt-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  {group}
                </p>
              )}
              {items.map(({ label, href, icon }) => {
                const active = isActive(href);
                return (
                  <button
                    key={href}
                    onClick={() => router.push(href)}
                    title={collapsed ? label : undefined}
                    className={`group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                      ${active
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={active ? "text-brand-600 dark:text-brand-300" : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500"}>
                      <Ic d={ICONS[icon]} size={18} />
                    </span>
                    {show && <span className="flex-1 text-left truncate">{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer — Back to App + Sign out */}
        <div className="border-t border-gray-100 px-2 py-2 shrink-0">
          <button
            onClick={() => router.push("/dashboard")}
            title={collapsed ? "Back to App" : undefined}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5 transition-colors"
          >
            <span className="text-gray-400 dark:text-gray-500"><Ic d={ICONS.back} size={18} /></span>
            {show && <span>Back to App</span>}
          </button>
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign Out" : undefined}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20 transition-colors"
          >
            <span className="text-rose-400 dark:text-rose-300/70"><Ic d={ICONS.signout} size={18} /></span>
            {show && <span>Sign Out</span>}
          </button>
          {show && (
            <p className="px-3 pt-2 pb-1 text-[10px] text-gray-400 dark:text-gray-500">
              {adminRole}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop sidebar — same sticky-below-72px contract as AppSidebar */}
      <aside
        aria-label="Admin sidebar"
        className="icareeros-sidebar hidden md:flex flex-col shrink-0 shadow-sm bg-white border-r border-gray-200 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]"
        style={{
          position: "sticky",
          top: 72,
          height: "calc(100vh - 72px)",
          width: collapsed ? 64 : 224,
          transition: "width 300ms ease",
          overflow: "hidden",
        }}
      >
        <NavContent />
      </aside>

      {/* Mobile: full-screen overlay drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[150] flex md:hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation drawer"
        >
          <div
            className="icareeros-sidebar flex flex-col bg-white border-r border-gray-200 shadow-xl overflow-hidden dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]"
            style={{ width: 256, height: "100%" }}
            onClick={e => e.stopPropagation()}
          >
            <NavContent mobile />
          </div>
          <div className="flex-1 bg-black/30" aria-hidden="true" />
        </div>
      )}
    </>
  );
}
