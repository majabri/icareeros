"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";

const Ic = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className="shrink-0">
    <path d={d} />
  </svg>
);

const ICONS = {
  dashboard:    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  profile:      "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  fitcheck:     "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  jobs:         "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  autopilot:    "M12 2a10 10 0 1 0 10 10 M12 8v4l3 3 M2 12h4 M18.4 5.6l-2.8 2.8",
  pipeline:     "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  interview:    "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
  offers:       "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  flightplan:   "M3 17l2-2 4 1 7-7 M21 3l-6.5 18a.55.55 0 0 1-1 0L11 13 3 9a.55.55 0 0 1 0-1z",
  openmarket:   "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  skillstore:   "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  settings:     "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  signout:      "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  menu:         "M3 12h18 M3 6h18 M3 18h18",
  close:        "M18 6L6 18 M6 6l12 12",
};

const NAV = [
  { href: "/dashboard",    label: "Career OS",      icon: "dashboard"   },
  { href: "/profile",      label: "Career Profile", icon: "profile"     },
  { href: "/resume",       label: "Fit Check",      icon: "fitcheck"    },
  { href: "/jobs",         label: "Opportunities",  icon: "jobs"        },
  { href: "/auto-apply",   label: "Autopilot",      icon: "autopilot"   },
  { href: "/applications", label: "Pipeline",       icon: "pipeline"    },
  { href: "/interview",    label: "Interview",      icon: "interview"   },
  { href: "/offers",       label: "Offer Desk",     icon: "offers"      },
  { href: "/career",       label: "Flight Plan",    icon: "flightplan"  },
  { href: "/gigs",         label: "Open Market",    icon: "openmarket"  },
  { href: "/services",     label: "Skill Store",    icon: "skillstore"  },
  { href: "/settings",     label: "Settings",       icon: "settings"    },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      setUserName(meta?.full_name ?? data.user?.email?.split("@")[0] ?? "");
    });
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={`flex h-full flex-col bg-white border-r border-gray-200 ${isMobile ? "w-64" : collapsed ? "w-16" : "w-56"} transition-all duration-200`}>

      {/* ── Logo ── */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-gray-100">
        {(!collapsed || isMobile) && (
          <a href="/dashboard" className="flex items-center gap-2 font-bold text-brand-600 text-base tracking-tight">
            iCareerOS
          </a>
        )}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Ic d={ICONS.menu} size={16} />
          </button>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-md p-1.5 text-gray-400 hover:text-gray-600">
            <Ic d={ICONS.close} size={16} />
          </button>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2" aria-label="Main navigation">
        {NAV.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <a
              key={href}
              href={href}
              title={collapsed && !isMobile ? label : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                ${active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }
                ${collapsed && !isMobile ? "justify-center px-2" : ""}`}
            >
              <span className={active ? "text-brand-600" : "text-gray-400"}>
                <Ic d={ICONS[icon as keyof typeof ICONS]} />
              </span>
              {(!collapsed || isMobile) && <span>{label}</span>}
            </a>
          );
        })}
      </nav>

      {/* ── User + sign out ── */}
      <div className="border-t border-gray-100 px-2 py-3">
        {(!collapsed || isMobile) && userName && (
          <div className="px-3 py-1.5 text-xs text-gray-400 truncate">{userName}</div>
        )}
        <button
          onClick={signOut}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors
            ${collapsed && !isMobile ? "justify-center px-2" : ""}`}
          title={collapsed && !isMobile ? "Sign out" : undefined}
        >
          <span className="text-gray-400"><Ic d={ICONS.signout} /></span>
          {(!collapsed || isMobile) && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col h-screen sticky top-0 shrink-0 shadow-sm">
        <SidebarContent />
      </aside>

      {/* ── Mobile: hamburger + overlay drawer ────────────────────── */}
      <div className="md:hidden">
        <div className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Open navigation"
          >
            <Ic d={ICONS.menu} size={20} />
          </button>
          <a href="/dashboard" className="font-bold text-brand-600 text-base">iCareerOS</a>
          <div className="w-8" />
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
            <div onClick={e => e.stopPropagation()}>
              <SidebarContent isMobile />
            </div>
            <div className="flex-1 bg-black/30" />
          </div>
        )}
      </div>
    </>
  );
}
