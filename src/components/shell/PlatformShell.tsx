"use client";

/**
 * PlatformShell — unified chrome for jobs.* and hire.*
 *
 * Wraps every authenticated page in:
 *   ConstellationBackground (fixed, behind everything)
 *   AppTopBar (with platform tagline)
 *   Sidebar (config-driven flat list, OR a custom slot)
 *   Main content
 *
 * Two usage modes:
 *   • Custom-sidebar mode (jobs platform):
 *       <PlatformShell config={JOBS_CONFIG} customSidebar={<AppSidebar … />}>
 *       PlatformShell renders the chrome; the caller controls the sidebar
 *       contents. Jobs uses this to preserve the rich 6-stage career-OS
 *       sidebar without flattening it into the config schema.
 *
 *   • Config-driven mode (hire platform):
 *       <PlatformShell config={HIRE_CONFIG}>{children}</PlatformShell>
 *       PlatformShell renders the sidebar from config.navItems +
 *       config.footerItems with the dark navy theme.
 *
 * Mobile-drawer state is owned here, so the top bar's hamburger and the
 * sidebar's close button stay in sync regardless of platform.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ConstellationBackground } from "@/components/ConstellationBackground";
import { AppTopBar } from "@/components/AppTopBar";
import { isNavItemActive, type PlatformConfig, type NavItem } from "@/components/shell/platform.config";
import { BRAND_COLORS } from "@/lib/design-tokens";
import { IconLock } from "@tabler/icons-react";

// Must match AppTopBar height
const TOP_BAR_H = 72;

// Theme-aware tokens — delegate to the CSS variables defined in
// globals.css so the sidebar follows the user's light/dark preference.
// In light theme: SURFACE = white, TEXT = dark slate, BORDER = light gray.
// In dark theme:  SURFACE = #162338 (JBS card), TEXT = white, BORDER = cyan-tinted.
// TEAL stays as the hire-side accent in both themes — it reads against
// both light and dark backgrounds (4.5:1 contrast).
const SURFACE      = "var(--surface-card, #ffffff)";
const SURFACE_DEEP = "var(--surface-page, #ffffff)";
const BORDER       = "var(--surface-border, #e5e7eb)";
const TEXT         = "var(--text-primary, #0f172a)";
const MUTED        = "var(--text-muted, #6b7280)";
// TEAL routed through design-tokens; TEAL_TINT remains an rgba literal
// per the brief's CSS-string-context exception.
const TEAL         = BRAND_COLORS.teal;
const TEAL_TINT    = "rgba(0,184,169,0.12)";

interface PlatformShellProps {
  config:         PlatformConfig;
  children:       React.ReactNode;
  /**
   * Optional sidebar override. When provided, PlatformShell renders this
   * instead of the config-driven sidebar. The override component is
   * expected to manage its own mobile-drawer state (jobs' AppSidebar
   * receives mobileOpen / setMobileOpen via React Context-equivalent
   * prop wiring through the layout — see (app)/layout.tsx for the
   * pattern).
   */
  customSidebar?: React.ReactNode;
}

export function PlatformShell({ config, children, customSidebar }: PlatformShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <ConstellationBackground />

      <div style={{ position: "relative", zIndex: 1 }}>
        <AppTopBar
          onMenuClick={() => setMobileOpen(true)}
          tagline={config.tagline}
        />

        <div className="flex" style={{ paddingTop: TOP_BAR_H, minHeight: "100vh" }}>
          {customSidebar ?? (
            <ConfigDrivenSidebar
              config={config}
              mobileOpen={mobileOpen}
              setMobileOpen={setMobileOpen}
            />
          )}

          <main
            id="main-content"
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

// ── Config-driven sidebar (used by hire) ─────────────────────────────────────

interface SidebarProps {
  config:        PlatformConfig;
  mobileOpen:    boolean;
  setMobileOpen: (v: boolean) => void;
}

function ConfigDrivenSidebar({ config, mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname() ?? "";

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  async function signOut() {
    try { await createClient().auth.signOut(); }
    finally { window.location.href = "https://icareeros.com/"; }
  }

  const content = (
    <SidebarContent
      config={config}
      pathname={pathname}
      onItemClick={() => setMobileOpen(false)}
      onSignOut={signOut}
    />
  );

  return (
    <>
      <aside
        aria-label={`${config.sidebarLabel} sidebar`}
        className="hidden md:flex"
        style={{
          position:   "sticky",
          top:        TOP_BAR_H,
          height:     `calc(100vh - ${TOP_BAR_H}px)`,
          width:      224,
          flexShrink: 0,
        }}
      >
        {content}
      </aside>

      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${config.sidebarLabel} navigation`}
          onClick={() => setMobileOpen(false)}
          className="md:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 256, height: "100%", background: SURFACE }}
          >
            {content}
          </div>
          <div aria-hidden style={{ flex: 1, background: "rgba(0,0,0,0.45)" }} />
        </div>
      )}
    </>
  );
}

// ── Sidebar content + visual primitives ──────────────────────────────────────

function Icon({ d, size = 18, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

function NavRow({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  // ── Section divider — labelled separator, never a Link ────────────────
  if (item.type === "section") {
    return (
      <div style={{ margin: "0.85rem 0 0.4rem" }}>
        <div
          role="separator"
          aria-hidden
          style={{ height: 1, background: BORDER, margin: "0 1rem 0.5rem" }}
        />
        <div
          style={{
            padding:       "0 0.95rem",
            fontSize:      "0.65rem",
            fontWeight:    700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:         MUTED,
          }}
        >
          {item.label}
        </div>
      </div>
    );
  }

  // ── Stage number prefix — inline mono prefix before the label ─────────
  // Only rendered when item.stageNumber is present (HIRE_CONFIG pathway).
  const stageNumberEl = item.stageNumber ? (
    <span
      aria-hidden
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize:   "0.7rem",
        fontWeight: 600,
        color:      MUTED,
        flexShrink: 0,
      }}
    >
      {item.stageNumber}
    </span>
  ) : null;

  // ── Coming-soon branch — visually muted div, no nav, "Soon" badge ─────
  if (item.comingSoon) {
    return (
      <div
        role="button"
        aria-disabled="true"
        tabIndex={-1}
        title={`${item.label} — Coming soon`}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "0.65rem",
          padding:      "0.5rem 0.75rem",
          margin:       "0 0.5rem 0.15rem",
          borderRadius: "0.5rem",
          color:        MUTED,
          fontSize:     "0.875rem",
          fontWeight:   500,
          cursor:       "default",
        }}
      >
        <Icon d={item.icon} color={item.color} />
        {stageNumberEl}
        <span style={{ flex: 1 }}>{item.label}</span>
        <span
          style={{
            fontSize:     "0.625rem",
            fontWeight:   600,
            color:        "var(--text-muted, #6b7280)",
            background:   "var(--surface-muted, #f8fafc)",
            border:       `1px solid ${BORDER}`,
            padding:      "0.125rem 0.4rem",
            borderRadius: "999px",
            lineHeight:   1,
          }}
        >
          Soon
        </span>
      </div>
    );
  }

  // ── Locked branch — Starter+ gate. Non-clickable, lock badge, tooltip ─
  // Visible (not hidden) so Free-plan employers see the gated stages.
  if (item.locked) {
    return (
      <div
        role="link"
        aria-disabled="true"
        tabIndex={-1}
        title="Upgrade to Starter to access"
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "0.65rem",
          padding:        "0.5rem 0.75rem",
          margin:         "0 0.5rem 0.15rem",
          borderRadius:   "0.5rem",
          color:          TEXT,
          opacity:        0.5,
          fontSize:       "0.875rem",
          fontWeight:     500,
          cursor:         "not-allowed",
        }}
      >
        <Icon d={item.icon} color={item.color} />
        {stageNumberEl}
        <span style={{ flex: 1 }}>{item.label}</span>
        <IconLock
          size={12}
          strokeWidth={1.5}
          aria-hidden
          style={{ color: MUTED, flexShrink: 0 }}
        />
      </div>
    );
  }

  // ── Default — clickable Link, with optional stage colour + number ─────
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "0.65rem",
        padding:        "0.5rem 0.75rem",
        margin:         "0 0.5rem 0.15rem",
        borderRadius:   "0.5rem",
        color:          active ? TEAL : TEXT,
        background:     active ? TEAL_TINT : "transparent",
        fontSize:       "0.875rem",
        fontWeight:     active ? 600 : 500,
        textDecoration: "none",
        transition:     "background 120ms ease, color 120ms ease",
      }}
    >
      <Icon d={item.icon} color={item.color} />
      {stageNumberEl}
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  config,
  pathname,
  onItemClick,
  onSignOut,
}: {
  config:      PlatformConfig;
  pathname:    string;
  onItemClick: () => void;
  onSignOut:   () => void;
}) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        height:         "100%",
        background:     SURFACE,
        borderRight:    `1px solid ${BORDER}`,
      }}
    >
      {/* Sidebar header — iCareerOS wordmark + teal pill platform badge */}
      <div style={{ padding: "1rem 1rem 0.75rem" }}>
        <Link
          href="/dashboard"
          onClick={onItemClick}
          aria-label={`${config.sidebarLabel} — home`}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            "0.6rem",
            textDecoration: "none",
            color:          TEXT,
          }}
        >
          <span
            aria-hidden
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          28,
              height:         28,
              borderRadius:   6,
              background:     TEAL,
              color:          "#ffffff",
              fontWeight:     700,
              fontSize:       "0.85rem",
            }}
          >
            iC
          </span>
          <span style={{ fontWeight: 700, letterSpacing: "0.3px" }}>iCareerOS</span>
        </Link>
        <span
          style={{
            display:      "inline-block",
            marginTop:    "0.5rem",
            fontSize:     "0.65rem",
            fontWeight:   700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color:        TEAL,
            background:   TEAL_TINT,
            padding:      "0.15rem 0.6rem",
            borderRadius: "999px",
          }}
        >
          {config.sidebarLabel}
        </span>
      </div>

      <div role="separator" aria-hidden style={{ height: 1, background: BORDER, margin: "0.25rem 1rem 0" }} />

      <div style={{ flex: 1, overflowY: "auto", marginTop: "0.5rem" }}>
        <nav aria-label={`${config.sidebarLabel} primary navigation`}>
          {config.navItems.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isNavItemActive(pathname, item)}
              onClick={onItemClick}
            />
          ))}
        </nav>

        {config.footerItems.length > 0 && (
          <>
            <div role="separator" aria-hidden style={{ height: 1, background: BORDER, margin: "0.5rem 1rem" }} />
            <nav aria-label={`${config.sidebarLabel} settings`}>
              {config.footerItems.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isNavItemActive(pathname, item)}
                  onClick={onItemClick}
                />
              ))}
            </nav>
          </>
        )}
      </div>

      <div role="separator" aria-hidden style={{ height: 1, background: BORDER, margin: "0 1rem" }} />

      <button
        type="button"
        onClick={() => { onItemClick(); onSignOut(); }}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "0.65rem",
          padding:        "0.65rem 0.75rem",
          margin:         "0.5rem 0.5rem 0.75rem",
          borderRadius:   "0.5rem",
          background:     "transparent",
          border:         "none",
          color:          MUTED,
          fontSize:       "0.875rem",
          fontWeight:     500,
          textAlign:      "left",
          cursor:         "pointer",
          width:          "calc(100% - 1rem)",
        }}
      >
        <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
        <span>Sign out</span>
      </button>
    </div>
  );
}
