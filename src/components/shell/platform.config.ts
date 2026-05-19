/**
 * Platform configuration — declarative spec for the unified PlatformShell.
 *
 * Two configs ship with the platform. JOBS_CONFIG is consumed by the
 * `(app)` route group on jobs.icareeros.com; HIRE_CONFIG is consumed by
 * the `(hire)` route group on hire.icareeros.com. Each config supplies:
 *   - branding (tagline + sidebar pill label)
 *   - nav items (employed by PlatformShell when no custom sidebar is
 *     passed; the jobs side passes a custom <AppSidebar/> for its rich
 *     career-OS surface and ignores navItems/footerItems)
 *
 * The shape is intentionally flat — adequate for hire's 5-item nav.
 * The jobs side's 6-stage hierarchical sidebar lives in AppSidebar.tsx
 * and is wired in via PlatformShell's `customSidebar` prop.
 */

export type NavItem = {
  href:          string;
  label:         string;
  /** Inline SVG path string. Same icon vocabulary used by AppSidebar. */
  icon:          string;
  comingSoon?:   boolean;
  /** Active-state matches when pathname starts with any of these. */
  matchPrefixes?: string[];
};

export type PlatformConfig = {
  id:            "jobs" | "hire";
  /** Short, muted line under the iCareerOS logo in the top bar. */
  tagline:       string;
  /** Teal pill rendered under the sidebar wordmark — e.g. "Career OS" / "Hire OS". */
  sidebarLabel:  string;
  /** Flat nav list. Ignored when PlatformShell receives a `customSidebar` slot. */
  navItems:      NavItem[];
  /** Separated nav block below the main list (e.g. Settings / Profile). */
  footerItems:   NavItem[];
};

// ── Icon path strings (single-source-of-truth — keep in sync with AppSidebar.ICONS) ───
const ICON = {
  search:    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  invite:    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  company:   "M3 21h18 M5 21V7l7-4 7 4v14 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M9 17h2 M13 17h2",
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
} as const;

export const JOBS_CONFIG: PlatformConfig = {
  id:           "jobs",
  tagline:      "Your Career OS",
  sidebarLabel: "Career OS",
  // Jobs platform supplies its own AppSidebar (rich 6-stage career-OS
  // surface) via PlatformShell.customSidebar — these items are not
  // rendered by PlatformShell. Listed here for completeness so the
  // config shape stays uniform between platforms.
  navItems: [
    { href: "/dashboard", label: "Career OS Dashboard", icon: ICON.dashboard },
  ],
  footerItems: [],
};

export const HIRE_CONFIG: PlatformConfig = {
  id:           "hire",
  tagline:      "Hire smarter, not harder",
  sidebarLabel: "Hire OS",
  navItems: [
    {
      href:          "/dashboard",
      label:         "Find Talent",
      icon:          ICON.search,
      matchPrefixes: ["/dashboard", "/candidates"],
    },
    { href: "/jobs",    label: "Job Postings", icon: ICON.briefcase, comingSoon: true },
    { href: "/invites", label: "Invites Sent", icon: ICON.invite,    comingSoon: true },
  ],
  footerItems: [
    { href: "/profile", label: "Company Profile", icon: ICON.company },
  ],
};


/**
 * Active-state predicate. A nav item is active when the current pathname
 * exactly matches one of its `matchPrefixes` (defaults to [item.href]) or
 * starts with one of them followed by a `/`.
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const prefixes = item.matchPrefixes ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
