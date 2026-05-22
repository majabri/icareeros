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
 * Hire-side nav (rewritten 2026-05-21 per Platform Strategy Chat brief):
 * iCareerOS Dashboard → People Retention Pathway divider → six
 * stages (Design / Select / Integrate / Support / Develop / Retain)
 * → footer items (Company Profile / Settings). Stage 04 routes to
 * `/support` — Phase 4 middleware rewrites it to `/hire/support` on
 * hire.*, where PR #278 placed the page (no PROTECTED collision —
 * Phase 4 returns before the PROTECTED check for hire.* paths).
 *
 * Forward-data-only: this PR populates new optional NavItem fields
 * (`type`, `stageNumber`, `color`, `locked`) but does NOT update the
 * ConfigDrivenSidebar in PlatformShell.tsx to render section
 * dividers, stage-coloured icons, or lock badges. That UI is a
 * follow-up brief.
 *
 * The jobs side's 6-stage hierarchical sidebar lives in AppSidebar.tsx
 * and is wired in via PlatformShell's `customSidebar` prop.
 */

import { STAGE_COLORS_MAP, BRAND_COLORS } from "@/lib/design-tokens";


export type NavItem = {
  href:          string;
  label:         string;
  /** Inline SVG path string. Same icon vocabulary used by AppSidebar. */
  icon:          string;
  comingSoon?:   boolean;
  /** Active-state matches when pathname starts with any of these. */
  matchPrefixes?: string[];
  /**
   * Discriminator. Defaults to "item" when omitted. "section" entries
   * are header/divider rows in the nav — they have no real route and
   * should not be rendered as nav rows by the consumer.
   */
  type?:         "item" | "section";
  /** Two-character zero-padded stage number (e.g. "01"). Used by the hire pathway. */
  stageNumber?:  string;
  /** Stage colour token (already a hex string from `@/lib/design-tokens`). */
  color?:        string;
  /**
   * True when the item is gated behind a paid plan. Consumer is
   * expected to render a lock icon + tooltip + suppress navigation
   * for users without the right plan. See follow-up brief for UI.
   */
  locked?:       boolean;
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
//
// New entries added 2026-05-21 for the hire People Retention Pathway:
// layoutDashboard, pencilRuler, userSearch, usersPlus, heartHandshake,
// trendingUp, shieldCheck, settings. Style matches the existing
// hand-simplified outline-stroke vocabulary — recognisable approximations
// of the Tabler icons referenced in the brief.
const ICON = {
  // Pre-existing
  search:    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  invite:    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  company:   "M3 21h18 M5 21V7l7-4 7 4v14 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M9 17h2 M13 17h2",
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",

  // New — hire People Retention Pathway
  layoutDashboard: "M3 4h7v7H3z M14 4h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  pencilRuler:     "M3 21v-3l11-11 3 3-11 11z M14 7l3 3 M2 12h2 M4 14h-2 M2 16h2",
  userSearch:      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4 M21 21l-3-3 M19 16a3 3 0 1 0-6 0 3 3 0 0 0 6 0z",
  usersPlus:       "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M16 11h6",
  heartHandshake:  "M12 21l-7-7a4 4 0 0 1 6-6l1 1 1-1a4 4 0 0 1 6 6z M12 5l-3 3 3 3 3-3z",
  trendingUp:      "M3 17l6-6 4 4 8-8 M14 7h7v7",
  shieldCheck:     "M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z M9 12l2 2 4-4",
  settings:        "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
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
    // ── Top item ─────────────────────────────────────────────────
    {
      href:          "/dashboard",
      label:         "iCareerOS Dashboard",
      icon:          ICON.layoutDashboard,
      color:         BRAND_COLORS.teal, // brand-primary teal — no stage colour rotation here
      // Preserve existing multi-prefix behaviour so /candidates/* still
      // lights up the dashboard row in the nav.
      matchPrefixes: ["/dashboard", "/candidates"],
    },

    // ── Section divider — People Retention Pathway ───────────────
    // Forward-data-only; ConfigDrivenSidebar in PlatformShell.tsx must
    // be updated in a follow-up brief to skip rendering section rows
    // as standard nav links.
    {
      type:  "section",
      href:  "#section-people-retention-pathway",
      label: "People Retention Pathway",
      icon:  "",
    },

    // ── 6-stage pathway ─────────────────────────────────────────
    {
      href:        "/design",
      label:       "Design",
      icon:        ICON.pencilRuler,
      stageNumber: "01",
      color:       STAGE_COLORS_MAP.evaluate, // #00B8A9
      // Free plan — accessible to all
      locked:      false,
    },
    {
      href:        "/select",
      label:       "Select",
      icon:        ICON.userSearch,
      stageNumber: "02",
      color:       STAGE_COLORS_MAP.advise,   // #FF6B6B
      // Free plan — accessible to all
      locked:      false,
    },
    {
      href:        "/integrate",
      label:       "Integrate",
      icon:        ICON.usersPlus,
      stageNumber: "03",
      color:       STAGE_COLORS_MAP.learn,    // #F5A623
      // Starter+ — locked for Free plan users
      locked:      true,
    },
    {
      // /support — Phase 4 middleware rewrites to /hire/support on
      // hire.*; PROTECTED check never fires for hire.* paths (returns early).
      href:        "/support",
      label:       "Support",
      icon:        ICON.heartHandshake,
      stageNumber: "04",
      color:       STAGE_COLORS_MAP.act,      // #10B981
      // Starter+
      locked:      true,
    },
    {
      href:        "/develop",
      label:       "Develop",
      icon:        ICON.trendingUp,
      stageNumber: "05",
      color:       STAGE_COLORS_MAP.coach,    // #7B9AC0
      // Starter+
      locked:      true,
    },
    {
      href:        "/retain",
      label:       "Retain",
      icon:        ICON.shieldCheck,
      stageNumber: "06",
      color:       STAGE_COLORS_MAP.achieve,  // #40C9C0
      // Starter+
      locked:      true,
    },
  ],
  footerItems: [
    { href: "/profile",  label: "Company Profile", icon: ICON.company },
    { href: "/settings", label: "Settings",        icon: ICON.settings },
  ],
};


/**
 * Active-state predicate. A nav item is active when the current pathname
 * exactly matches one of its `matchPrefixes` (defaults to [item.href]) or
 * starts with one of them followed by a `/`.
 *
 * Section entries are never active (they have no real route).
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.type === "section") return false;
  const prefixes = item.matchPrefixes ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
