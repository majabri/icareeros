"use client";

/**
 * Phase 3 (2026-05-17) — Hired (recruiter) app shell.
 *
 * Two-column layout that mirrors the job-seeker AppSidebar pattern but
 * adopts the dark navy / teal visual system used by hire.icareeros.com:
 *
 *   Sidebar bg   #0F1B2D   (navy — same as the page background)
 *   Surface      #1A2D45   (slate)
 *   Active       #00B8A9   (teal)
 *   Active bg    rgba(0,184,169,0.12)
 *   Text base    #E5EEFA
 *   Muted        #7B9AC0
 *
 * Desktop  : sticky sidebar (224px) + flex main column.
 * Mobile   : hamburger in the top bar opens a full-height drawer.
 * Active   : nav item highlighted in teal when the pathname matches the
 *            item's href prefix.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const NAVY        = "#0F1B2D";
const NAVY_DEEPER = "#0B1422";
const BORDER      = "#1F2E48";
const TEXT        = "#E5EEFA";
const MUTED       = "#7B9AC0";
const TEAL        = "#00B8A9";
const TEAL_TINT   = "rgba(0,184,169,0.12)";

type NavItem = {
  href:        string;
  label:       string;
  icon:        string;
  comingSoon?: boolean;
  matchPrefixes?: string[];
};

const ICON = {
  hire:      "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4",
  search:    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  invite:    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  company:   "M3 21h18 M5 21V7l7-4 7 4v14 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M9 17h2 M13 17h2",
  menu:      "M3 12h18 M3 6h18 M3 18h18",
  close:     "M18 6L6 18 M6 6l12 12",
  signout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};

const NAV_ITEMS: NavItem[] = [
  { href: "/hired/dashboard", label: "Find Talent",  icon: ICON.search,    matchPrefixes: ["/hired/dashboard", "/hired/candidates"] },
  { href: "/hired/jobs",      label: "Job Postings", icon: ICON.briefcase, comingSoon: true },
  { href: "/hired/invites",   label: "Invites Sent", icon: ICON.invite,    comingSoon: true },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: "/hired/profile", label: "Company Profile", icon: ICON.company },
];

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

function isItemActive(pathname: string, item: NavItem): boolean {
  const prefixes = item.matchPrefixes ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

interface NavListProps {
  pathname:    string;
  onItemClick: () => void;
}

function NavList({ pathname, onItemClick }: NavListProps) {
  const renderItem = (item: NavItem) => {
    const active = isItemActive(pathname, item);

    if (item.comingSoon) {
      return (
        <div key={item.href} role="button" aria-disabled="true" tabIndex={-1}
          title={`${item.label} — Coming soon`}
          style={{
            display: "flex", alignItems: "center", gap: "0.65rem",
            padding: "0.5rem 0.75rem", margin: "0 0.5rem 0.15rem",
            borderRadius: "0.5rem", color: MUTED,
            fontSize: "0.875rem", fontWeight: 500, cursor: "default",
          }}>
          <Icon d={item.icon} />
          <span style={{ flex: 1 }}>{item.label}</span>
          <span style={{
            fontSize: "0.625rem", fontWeight: 600, color: "#5A7299",
            background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
            padding: "0.125rem 0.4rem", borderRadius: "999px", lineHeight: 1,
          }}>Soon</span>
        </div>
      );
    }

    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        onClick={onItemClick}
        style={{
          display: "flex", alignItems: "center", gap: "0.65rem",
          padding: "0.5rem 0.75rem", margin: "0 0.5rem 0.15rem",
          borderRadius: "0.5rem",
          color:      active ? TEAL : TEXT,
          background: active ? TEAL_TINT : "transparent",
          fontSize:   "0.875rem", fontWeight: active ? 600 : 500,
          textDecoration: "none",
          transition: "background 120ms ease, color 120ms ease",
        }}>
        <Icon d={item.icon} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Hired sidebar primary" style={{ marginTop: "0.5rem" }}>
        {NAV_ITEMS.map(renderItem)}
      </nav>
      <div role="separator" aria-hidden="true"
        style={{ height: 1, background: BORDER, margin: "0.5rem 1rem" }} />
      <nav aria-label="Hired sidebar settings">
        {FOOTER_ITEMS.map(renderItem)}
      </nav>
    </>
  );
}

interface SidebarContentProps {
  pathname:    string;
  onItemClick: () => void;
  onSignOut:   () => void;
}

function SidebarContent({ pathname, onItemClick, onSignOut }: SidebarContentProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: NAVY, borderRight: `1px solid ${BORDER}`,
    }}>
      <Link href="/hired/dashboard" onClick={onItemClick} aria-label="Hire OS — home"
        style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "1rem 1rem 0.75rem", textDecoration: "none", color: TEXT,
        }}>
        <span aria-hidden style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 6, background: TEAL, color: NAVY_DEEPER,
        }}>
          <Icon d={ICON.hire} size={16} />
        </span>
        <span style={{ fontWeight: 700, letterSpacing: "0.3px" }}>
          Hire <span style={{ color: TEAL }}>OS</span>
        </span>
      </Link>

      <div role="separator" aria-hidden="true"
        style={{ height: 1, background: BORDER, margin: "0.25rem 1rem 0" }} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <NavList pathname={pathname} onItemClick={onItemClick} />
      </div>

      <div role="separator" aria-hidden="true"
        style={{ height: 1, background: BORDER, margin: "0 1rem" }} />

      <button type="button"
        onClick={() => { onItemClick(); onSignOut(); }}
        style={{
          display: "flex", alignItems: "center", gap: "0.65rem",
          padding: "0.65rem 0.75rem", margin: "0.5rem 0.5rem 0.75rem",
          borderRadius: "0.5rem", background: "transparent", border: "none",
          color: MUTED, fontSize: "0.875rem", fontWeight: 500,
          textAlign: "left", cursor: "pointer", width: "calc(100% - 1rem)",
        }}>
        <Icon d={ICON.signout} />
        <span>Sign out</span>
      </button>
    </div>
  );
}

export function HiredShell({ children }: { children: React.ReactNode }) {
  const pathname        = usePathname() ?? "";
  const router          = useRouter();
  const [open,  setOpen]  = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    createClient().auth.getUser()
      .then(({ data }) => { if (mounted) setEmail(data.user?.email ?? null); })
      .catch(() => { /* middleware redirects unauth'd; don't crash here */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  async function signOut() {
    try { await createClient().auth.signOut(); }
    finally { router.push("/auth/login"); }
  }

  return (
    <div style={{ background: NAVY, color: TEXT, minHeight: "100vh" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: NAVY_DEEPER, borderBottom: `1px solid ${BORDER}`,
        padding: "0.65rem 1rem",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      }}>
        <button type="button" aria-label="Open navigation" aria-expanded={open}
          aria-controls="hired-mobile-drawer" onClick={() => setOpen(true)}
          className="md:hidden"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 8,
            background: "transparent", border: `1px solid ${BORDER}`,
            color: TEXT, cursor: "pointer",
          }}>
          <Icon d={ICON.menu} />
        </button>

        <div className="hidden md:block" style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {email && (
            <span title={email} style={{
              color: MUTED, fontSize: "0.825rem", maxWidth: "16rem",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{email}</span>
          )}
          <button type="button" onClick={signOut} aria-label="Sign out"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.4rem",
              background: "transparent", border: `1px solid ${BORDER}`,
              color: TEXT, fontSize: "0.8rem",
              padding: "0.35rem 0.7rem", borderRadius: "999px", cursor: "pointer",
            }}>
            <Icon d={ICON.signout} size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside aria-label="Hired sidebar" className="hidden md:flex"
          style={{
            position: "sticky", top: 56,
            height: "calc(100vh - 56px)", width: 224, flexShrink: 0,
          }}>
          <SidebarContent
            pathname={pathname}
            onItemClick={() => { /* desktop: no-op */ }}
            onSignOut={signOut}
          />
        </aside>

        <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>

      {open && (
        <div id="hired-mobile-drawer" role="dialog" aria-modal="true"
          aria-label="Hired navigation" onClick={() => setOpen(false)}
          className="md:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 256, height: "100%", background: NAVY }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0.5rem",
            }}>
              <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 36, height: 36, borderRadius: 8,
                  background: "transparent", border: `1px solid ${BORDER}`,
                  color: TEXT, cursor: "pointer",
                }}>
                <Icon d={ICON.close} />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              onItemClick={() => setOpen(false)}
              onSignOut={signOut}
            />
          </div>
          <div aria-hidden="true" style={{ flex: 1, background: "rgba(0,0,0,0.45)" }} />
        </div>
      )}
    </div>
  );
}
