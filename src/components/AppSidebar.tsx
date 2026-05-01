"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getActiveCycle, type CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

// ── Inline SVG icon ───────────────────────────────────────────────────────────
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
  // ── app chrome ──────────────────────────────────────────────────────────────
  dashboard:  "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  menu:       "M3 12h18 M3 6h18 M3 18h18",
  close:      "M18 6L6 18 M6 6l12 12",
  signout:    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chevron:    "M9 18l6-6-6-6",
  // ── stage 1 – Evaluate ──────────────────────────────────────────────────────
  profile:    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  // ── stage 2 – Advise ────────────────────────────────────────────────────────
  resume:     "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  // ── stage 3 – Learn ─────────────────────────────────────────────────────────
  skills:     "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 M12 12h4 M12 16h4 M8 12h.01 M8 16h.01",
  target:     "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  store:      "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  // ── stage 4 – Act ───────────────────────────────────────────────────────────
  jobs:       "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  openmarket: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  autopilot:  "M12 2a10 10 0 1 0 10 10 M12 8v4l3 3 M2 12h4 M18.4 5.6l-2.8 2.8",
  pipeline:   "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  interview:  "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
  offers:     "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  // ── stage 5 – Coach ─────────────────────────────────────────────────────────
  coach:      "M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  // ── stage 6 – Achieve ───────────────────────────────────────────────────────
  achieve:    "M3 17l2-2 4 1 7-7 M21 3l-6.5 18a.55.55 0 0 1-1 0L11 13 3 9a.55.55 0 0 1 0-1z",
} as const;

type IconKey = keyof typeof ICONS;

// ── Lifecycle stage order ─────────────────────────────────────────────────────
const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "coach", "achieve",
];

// ── Nav item types ────────────────────────────────────────────────────────────
type SubItem = { href: string; label: string };
type NavItem = { href: string; label: string; icon: IconKey; children?: SubItem[] };

type StageSection = {
  stage: CareerOsStage;
  num: number;
  label: string;
  icon: IconKey;
  items: NavItem[];
  comingSoon?: boolean;
};

// ── Stage → nav items ─────────────────────────────────────────────────────────
const STAGES: StageSection[] = [
  {
    stage: "evaluate", num: 1, label: "Evaluate", icon: "profile",
    items: [
      { href: "/mycareer", label: "Career Profile", icon: "profile" },
    ],
  },
  {
    stage: "advise", num: 2, label: "Advise", icon: "resume",
    items: [
      { href: "/resume", label: "Resume Advisor", icon: "resume" },
    ],
  },
  {
    stage: "learn", num: 3, label: "Learn", icon: "store",
    items: [
      {
        href: "/mycareer/profile",
        label: "Current Skills",
        icon: "skills",
        children: [
          { href: "/mycareer/profile#skills",        label: "Skills"         },
          { href: "/mycareer/profile#education",     label: "Education"      },
          { href: "/mycareer/profile#certifications",label: "Certifications" },
        ],
      },
      { href: "/mycareer/preferences", label: "Target Skills", icon: "target" },
      { href: "/services",             label: "Skill Store",   icon: "store"  },
    ],
  },
  {
    stage: "act", num: 4, label: "Act", icon: "jobs",
    items: [
      { href: "/jobs",         label: "Opportunities", icon: "jobs"       },
      { href: "/gigs",         label: "Open Market",   icon: "openmarket" },
      { href: "/auto-apply",   label: "Autopilot",     icon: "autopilot"  },
      { href: "/applications", label: "Pipeline",      icon: "pipeline"   },
      { href: "/interview",    label: "Interview",     icon: "interview"  },
      { href: "/offers",       label: "Offer Desk",    icon: "offers"     },
    ],
  },
  {
    stage: "coach", num: 5, label: "Coach", icon: "coach",
    items: [],
    comingSoon: true,
  },
  {
    stage: "achieve", num: 6, label: "Achieve", icon: "achieve",
    items: [
      { href: "/career", label: "Flight Plan", icon: "achieve" },
    ],
  },
];

// ── Helper: classify a stage relative to the current one ──────────────────────
function stageStatus(
  stage: CareerOsStage,
  current: CareerOsStage | null,
): "past" | "current" | "future" {
  if (!current) return stage === "evaluate" ? "current" : "future";
  const ci = STAGE_ORDER.indexOf(current);
  const si = STAGE_ORDER.indexOf(stage);
  if (si < ci) return "past";
  if (si === ci) return "current";
  return "future";
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export function AppSidebar({ mobileOpen, setMobileOpen }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed]         = useState(false);
  const [currentStage, setCurrentStage]   = useState<CareerOsStage | null>(null);
  const [learnExpanded, setLearnExpanded] = useState(false);

  // Fetch active Career OS cycle to know the current stage
  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const cycle = await getActiveCycle(data.user.id);
      if (cycle?.current_stage) {
        setCurrentStage(cycle.current_stage as CareerOsStage);
      }
    });
  }, []);

  // Auto-expand the Learn section when navigating to a Learn-stage path
  useEffect(() => {
    if (
      pathname.startsWith("/mycareer/profile") ||
      pathname.startsWith("/mycareer/preferences") ||
      pathname.startsWith("/services")
    ) {
      setLearnExpanded(true);
    }
  }, [pathname]);

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));

  // ── Shared sidebar body rendered for both desktop and mobile ──────────────
  function NavContent({ mobile = false }: { mobile?: boolean }) {
    const show = !collapsed || mobile;    // show labels?

    return (
      <>
        {/* Collapse toggle — desktop only */}
        {!mobile && (
          <div className="flex h-10 items-center justify-end px-3 border-b border-gray-100 shrink-0">
            <button
              onClick={() => setCollapsed(c => !c)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Ic d={ICONS.menu} size={16} />
            </button>
          </div>
        )}

        {/* Mobile drawer header */}
        {mobile && (
          <div className="flex h-14 items-center justify-between px-4 border-b border-gray-100 shrink-0">
            <span
              style={{
                fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.5px",
                background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              iCareerOS
            </span>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600"
              aria-label="Close navigation"
            >
              <Ic d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2" aria-label="Main navigation">

          {/* Dashboard — standalone, above lifecycle stages */}
          <a
            href="/dashboard"
            title={!show ? "Career OS" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-1 text-sm font-semibold transition-colors
              ${isActive("/dashboard")
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
              ${!show ? "justify-center px-2" : ""}`}
          >
            <span className={isActive("/dashboard") ? "text-brand-600" : "text-gray-400"}>
              <Ic d={ICONS.dashboard} />
            </span>
            {show && <span>Career OS</span>}
          </a>

          <div className="my-2 border-t border-gray-100" />

          {/* Lifecycle stages */}
          {STAGES.map((section) => {
            const status    = stageStatus(section.stage, currentStage);
            const isFuture  = status === "future";
            const isCurrent = status === "current";

            return (
              <div key={section.stage} className={`mb-1 ${isFuture ? "opacity-60" : ""}`}>

                {/* Stage label row */}
                {show && (
                  <div
                    className={`flex items-center gap-1.5 mx-1 px-2 py-0.5 rounded mb-0.5
                      ${isCurrent ? "bg-cyan-50" : ""}`}
                  >
                    <span
                      className={`text-[9.5px] font-bold uppercase tracking-widest select-none
                        ${isCurrent ? "text-cyan-600" : "text-gray-400"}`}
                    >
                      {section.num}. {section.label}
                    </span>
                    {section.comingSoon && (
                      <span className="ml-auto text-[8px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                        Soon
                      </span>
                    )}
                  </div>
                )}

                {/* Items */}
                {section.items.map((item) => {
                  const hasChildren = "children" in item && Array.isArray(item.children);
                  const active      = !isFuture && isActive(item.href);

                  if (hasChildren) {
                    // Collapsible "Current Skills" row
                    const parentActive = !isFuture && pathname.startsWith("/mycareer");
                    return (
                      <div key={item.href}>
                        <button
                          disabled={isFuture}
                          onClick={() => !isFuture && setLearnExpanded(v => !v)}
                          title={!show ? item.label : undefined}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                            ${parentActive
                              ? "bg-brand-50 text-brand-700"
                              : isFuture
                                ? "text-gray-400 cursor-default"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
                            ${!show ? "justify-center px-2" : ""}`}
                        >
                          <span className={parentActive ? "text-brand-600" : "text-gray-400"}>
                            <Ic d={ICONS[item.icon]} />
                          </span>
                          {show && (
                            <>
                              <span className="flex-1 text-left">{item.label}</span>
                              <span
                                className="text-gray-400 inline-flex transition-transform duration-150"
                                style={{ transform: learnExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                              >
                                <Ic d={ICONS.chevron} size={13} />
                              </span>
                            </>
                          )}
                        </button>

                        {/* Sub-items */}
                        {show && learnExpanded && !isFuture && (
                          <div className="pl-9 pb-1">
                            {(item.children as SubItem[]).map((child) => {
                              const base        = child.href.split("#")[0];
                              const childActive = pathname === base || pathname.startsWith(base);
                              return (
                                <a
                                  key={child.href}
                                  href={child.href}
                                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 mb-0.5 text-[12.5px] transition-colors
                                    ${childActive
                                      ? "text-brand-700 font-medium"
                                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
                                >
                                  <span className="w-1 h-1 rounded-full bg-current opacity-40 shrink-0" />
                                  {child.label}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Future-stage item (non-clickable)
                  if (isFuture) {
                    return (
                      <div
                        key={item.href}
                        title={!show ? item.label : undefined}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium text-gray-400
                          ${!show ? "justify-center px-2" : ""}`}
                      >
                        <span className="text-gray-300"><Ic d={ICONS[item.icon]} /></span>
                        {show && <span>{item.label}</span>}
                      </div>
                    );
                  }

                  // Normal clickable item
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      title={!show ? item.label : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                        ${active
                          ? "bg-brand-50 text-brand-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
                        ${!show ? "justify-center px-2" : ""}`}
                    >
                      <span className={active ? "text-brand-600" : "text-gray-400"}>
                        <Ic d={ICONS[item.icon]} />
                      </span>
                      {show && <span>{item.label}</span>}
                    </a>
                  );
                })}

                {/* "Coming soon" placeholder for empty stages */}
                {section.comingSoon && section.items.length === 0 && show && (
                  <p className="px-5 py-1 text-[11px] text-gray-400 italic">
                    Features coming soon
                  </p>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sign-out footer */}
        <div className="border-t border-gray-100 px-2 py-3 shrink-0">
          <button
            onClick={signOut}
            title="Sign out"
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors
              ${!show ? "justify-center px-2" : ""}`}
          >
            <span className="text-gray-400"><Ic d={ICONS.signout} /></span>
            {show && <span>Sign out</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop sidebar — sits below the 56 px AppTopBar */}
      <aside
        className="hidden md:flex flex-col shrink-0 shadow-sm bg-white border-r border-gray-200"
        style={{
          position: "sticky",
          top: 56,
          height: "calc(100vh - 56px)",
          width: collapsed ? 64 : 224,
          transition: "width 0.2s",
          overflow: "hidden",
        }}
      >
        <NavContent />
      </aside>

      {/* Mobile: full-screen overlay drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[150] flex md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="flex flex-col bg-white border-r border-gray-200 shadow-xl overflow-hidden"
            style={{ width: 256, height: "100%" }}
            onClick={e => e.stopPropagation()}
          >
            <NavContent mobile />
          </div>
          <div className="flex-1 bg-black/30" />
        </div>
      )}
    </>
  );
}
