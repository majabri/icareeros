"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getActiveCycle, type CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

// ── Reduced-motion hook ───────────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ── SVG icon ─────────────────────────────────────────────────────────────────
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
  dashboard:  "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  menu:       "M3 12h18 M3 6h18 M3 18h18",
  close:      "M18 6L6 18 M6 6l12 12",
  signout:    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chevron:    "M9 18l6-6-6-6",
  check:      "M20 6L9 17l-5-5",
  lock:       "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
  profile:    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  resume:     "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  skills:     "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 M12 12h4 M12 16h4 M8 12h.01 M8 16h.01",
  target:     "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  store:      "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  jobs:       "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  openmarket: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  autopilot:  "M12 2a10 10 0 1 0 10 10 M12 8v4l3 3 M2 12h4 M18.4 5.6l-2.8 2.8",
  pipeline:   "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  interview:  "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
  offers:     "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  coach:      "M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  achieve:    "M3 17l2-2 4 1 7-7 M21 3l-6.5 18a.55.55 0 0 1-1 0L11 13 3 9a.55.55 0 0 1 0-1z",
} as const;

type IconKey = keyof typeof ICONS;

// ── Stage order + data ────────────────────────────────────────────────────────
const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "coach", "achieve",
];

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

const STAGES: StageSection[] = [
  {
    stage: "evaluate", num: 1, label: "Evaluate", icon: "profile",
    items: [{ href: "/mycareer", label: "Career Profile", icon: "profile" }],
  },
  {
    stage: "advise", num: 2, label: "Advise", icon: "resume",
    items: [{ href: "/resumeadvisor", label: "Resume Advisor", icon: "resume" }],
  },
  {
    stage: "learn", num: 3, label: "Learn", icon: "store",
    items: [
      { href: "/target-skills",          label: "Target Skills", icon: "target" },
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
    items: [], comingSoon: true,
  },
  {
    stage: "achieve", num: 6, label: "Achieve", icon: "achieve",
    items: [{ href: "/career", label: "Flight Plan", icon: "achieve" }],
  },
];

function stageStatus(stage: CareerOsStage, current: CareerOsStage | null): "past" | "current" | "future" {
  if (!current) return stage === "evaluate" ? "current" : "future";
  const ci = STAGE_ORDER.indexOf(current);
  const si = STAGE_ORDER.indexOf(stage);
  return si < ci ? "past" : si === ci ? "current" : "future";
}

// ── Skeleton loader bar ───────────────────────────────────────────────────────
const SkeletonBar = ({ w = "w-3/4" }: { w?: string }) => (
  <div className={`h-3 ${w} rounded bg-gray-100 animate-pulse`} />
);

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export function AppSidebar({ mobileOpen, setMobileOpen }: Props) {
  const pathname              = usePathname();
  const reducedMotion         = usePrefersReducedMotion();

  const [collapsed, setCollapsed]                 = useState(false);
  const [currentStage, setCurrentStage]           = useState<CareerOsStage | null>(null);
  const [stageLoaded, setStageLoaded]             = useState(false);
  const [learnExpanded, setLearnExpanded]         = useState(false);
  // Mobile accordion: tracks which stages have their items visible
  const [mobileOpen_stages, setMobileOpen_stages] = useState<Set<CareerOsStage>>(new Set(["evaluate"]));
  // Temporarily visible lock notice (stage name)
  const [lockNotice, setLockNotice]               = useState<CareerOsStage | null>(null);
  const lockTimer                                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-collapse on tablet widths (< 1024 px)
  useEffect(() => {
    function sync() { setCollapsed(window.innerWidth < 1024); }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // Load current Career OS stage
  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      const userId = data?.user?.id;
      if (!userId) { setStageLoaded(true); return; }
      const cycle = await getActiveCycle(userId);
      const stage = (cycle?.current_stage as CareerOsStage) ?? "evaluate";
      setCurrentStage(stage);
      // Mobile: open current stage by default
      setMobileOpen_stages(new Set([stage]));
      setStageLoaded(true);
    }).catch(() => {
      // Fail silently — sidebar still renders with default stage
      setStageLoaded(true);
    });
  }, []);

  // Auto-expand Learn subsection when on a Learn-stage path
  useEffect(() => {
    if (
      pathname.startsWith("/mycareer/profile") ||
      pathname.startsWith("/mycareer/preferences") ||
      pathname.startsWith("/services")
    ) setLearnExpanded(true);
  }, [pathname]);

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  // Show a 3-second lock notice for a future stage
  const triggerLockNotice = useCallback((stage: CareerOsStage) => {
    setLockNotice(stage);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => setLockNotice(null), 3000);
  }, []);

  // Mobile: toggle a stage's accordion panel
  function toggleMobileStage(stage: CareerOsStage) {
    setMobileOpen_stages(prev => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });
  }

  // Transition duration (0 when user prefers reduced motion)
  const dur = reducedMotion ? "0ms" : "300ms";

  // ── Shared nav body ─────────────────────────────────────────────────────────
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
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
            >
              <Ic d={ICONS.menu} size={16} />
            </button>
          </div>
        )}

        {/* Mobile drawer header */}
        {mobile && (
          <div className="flex h-14 items-center justify-between px-4 border-b border-gray-100 shrink-0">
            <span style={{
              fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              iCareerOS
            </span>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Ic d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        {/* Scrollable nav */}
        <nav
          aria-label="Career stages navigation"
          className="flex-1 overflow-y-auto py-2 px-2"
        >
          {/* Dashboard — standalone */}
          <a
            href="/dashboard"
            aria-current={isActive("/dashboard") ? "page" : undefined}
            title={!show ? "Career OS" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-1 text-sm font-semibold transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
              ${isActive("/dashboard") ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
              ${!show ? "justify-center px-2" : ""}`}
          >
            <span className={isActive("/dashboard") ? "text-brand-600" : "text-gray-400"}>
              <Ic d={ICONS.dashboard} />
            </span>
            {show && <span>Career OS</span>}
          </a>

          <div className="my-2 border-t border-gray-100" role="separator" />

          {/* Skeleton while loading */}
          {!stageLoaded && show && (
            <div className="space-y-3 px-3 py-2" aria-label="Loading navigation" aria-busy="true">
              {[..."123456"].map(i => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBar w="w-1/2" />
                  <SkeletonBar w="w-3/4" />
                </div>
              ))}
            </div>
          )}

          {/* Lifecycle stages */}
          {stageLoaded && STAGES.map((section) => {
            const status    = stageStatus(section.stage, currentStage);
            const isFuture  = status === "future";
            const isCurrent = status === "current";
            const isPast    = status === "past";
            const mobileExpanded = mobile ? mobileOpen_stages.has(section.stage) : true;
            const prevStageLabel = isFuture
              ? STAGES[STAGE_ORDER.indexOf(section.stage) - 1]?.label ?? ""
              : "";

            return (
              <div
                key={section.stage}
                role="group"
                aria-label={`Stage ${section.num}: ${section.label}`}
                className={`mb-1 ${isFuture ? "opacity-60" : ""}`}
                style={{ transition: `opacity ${dur} ease` }}
              >
                {/* Stage label row */}
                {show && (
                  <div className={`relative mx-1 mb-0.5 rounded ${isCurrent ? "bg-brand-50" : ""}`}
                    style={{ transition: `background-color ${dur} ease` }}
                  >
                    {/* On mobile, stage label is a toggle button */}
                    {mobile ? (
                      <button
                        onClick={() => isFuture ? triggerLockNotice(section.stage) : toggleMobileStage(section.stage)}
                        aria-expanded={mobileExpanded}
                        aria-disabled={isFuture}
                        disabled={isFuture}
                        className={`flex w-full items-center gap-1.5 px-2 py-1 rounded
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                          ${isFuture ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <span className={`text-[9.5px] font-bold uppercase tracking-widest select-none flex-1 text-left
                          ${isCurrent ? "text-brand-600" : "text-gray-400"}`}>
                          {section.num}. {section.label}
                        </span>
                        {isPast && (
                          <span className="text-green-500 shrink-0" aria-label="Completed">
                            <Ic d={ICONS.check} size={11} />
                          </span>
                        )}
                        {section.comingSoon && (
                          <span className="text-[8px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                            Soon
                          </span>
                        )}
                        {!isFuture && section.items.length > 0 && (
                          <span
                            className="text-gray-400 shrink-0 inline-flex"
                            style={{ transform: mobileExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: `transform ${dur} ease` }}
                          >
                            <Ic d={ICONS.chevron} size={12} />
                          </span>
                        )}
                      </button>
                    ) : (
                      /* Desktop: stage label is non-interactive */
                      <div className="flex items-center gap-1.5 px-2 py-0.5">
                        <span className={`text-[9.5px] font-bold uppercase tracking-widest select-none
                          ${isCurrent ? "text-brand-600" : "text-gray-400"}`}>
                          {section.num}. {section.label}
                        </span>
                        {isPast && (
                          <span className="text-green-500 shrink-0" aria-label="Completed">
                            <Ic d={ICONS.check} size={11} />
                          </span>
                        )}
                        {section.comingSoon && (
                          <span className="text-[8px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                            Soon
                          </span>
                        )}
                      </div>
                    )}

                    {/* Lock notice toast — shown when user taps a future stage */}
                    {lockNotice === section.stage && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="absolute left-0 right-0 top-full mt-1 mx-1 z-10 flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
                        style={{ animation: reducedMotion ? "none" : "fadeInDown 0.15s ease" }}
                      >
                        <Ic d={ICONS.lock} size={11} />
                        Complete Stage {STAGE_ORDER.indexOf(section.stage)} ({prevStageLabel}) to unlock
                      </div>
                    )}
                  </div>
                )}

                {/* Items — wrapped for height transition */}
                <div
                  id={`stage-${section.stage}-items`}
                  style={{
                    overflow: "hidden",
                    maxHeight: mobileExpanded || !mobile ? "600px" : "0px",
                    transition: reducedMotion ? "none" : `max-height ${dur} ease`,
                  }}
                >
                  {section.items.map((item) => {
                    const hasChildren = "children" in item && Array.isArray(item.children);
                    const active      = !isFuture && isActive(item.href);

                    if (hasChildren) {
                      const parentActive = !isFuture && pathname.startsWith("/mycareer");
                      return (
                        <div key={item.href}>
                          <button
                            onClick={() => isFuture ? triggerLockNotice(section.stage) : setLearnExpanded(v => !v)}
                            disabled={isFuture}
                            aria-expanded={learnExpanded}
                            aria-controls="learn-subitems"
                            aria-disabled={isFuture}
                            title={!show ? item.label : undefined}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                              ${parentActive ? "bg-brand-50 text-brand-700"
                                : isFuture ? "text-gray-400 cursor-default"
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
                                  className="text-gray-400 inline-flex shrink-0"
                                  style={{ transform: learnExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: `transform ${dur} ease` }}
                                  aria-hidden="true"
                                >
                                  <Ic d={ICONS.chevron} size={13} />
                                </span>
                              </>
                            )}
                          </button>

                          {/* Sub-items */}
                          <div
                            id="learn-subitems"
                            style={{
                              overflow: "hidden",
                              maxHeight: show && learnExpanded && !isFuture ? "200px" : "0px",
                              transition: reducedMotion ? "none" : `max-height ${dur} ease`,
                            }}
                          >
                            <div className="pl-9 pb-1">
                              {(item.children as SubItem[]).map((child) => {
                                const base = child.href.split("#")[0];
                                const childActive = pathname === base || pathname.startsWith(base);
                                return (
                                  <a
                                    key={child.href}
                                    href={child.href}
                                    aria-current={childActive ? "page" : undefined}
                                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 mb-0.5 text-[12.5px] transition-colors
                                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                                      ${childActive ? "text-brand-700 font-medium" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
                                  >
                                    <span className="w-1 h-1 rounded-full bg-current opacity-40 shrink-0" aria-hidden="true" />
                                    {child.label}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Future-stage item (non-clickable)
                    if (isFuture) {
                      return (
                        <div
                          key={item.href}
                          role="button"
                          aria-disabled="true"
                          tabIndex={0}
                          title={show ? `Complete Stage ${STAGE_ORDER.indexOf(section.stage)} (${prevStageLabel}) to unlock` : item.label}
                          onClick={() => triggerLockNotice(section.stage)}
                          onKeyDown={(e) => e.key === "Enter" && triggerLockNotice(section.stage)}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium text-gray-400 cursor-default
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
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
                        aria-current={active ? "page" : undefined}
                        title={!show ? item.label : undefined}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-sm font-medium transition-colors
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                          ${active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
                          ${!show ? "justify-center px-2" : ""}`}
                      >
                        <span className={active ? "text-brand-600" : "text-gray-400"}>
                          <Ic d={ICONS[item.icon]} />
                        </span>
                        {show && <span>{item.label}</span>}
                      </a>
                    );
                  })}

                  {/* Coming-soon placeholder for empty stages */}
                  {section.comingSoon && section.items.length === 0 && show && (
                    <p className="px-5 py-1 text-[11px] text-gray-400 italic">
                      Features coming soon
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sign out footer */}
        <div className="border-t border-gray-100 px-2 py-3 shrink-0">
          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-500
              hover:bg-gray-100 hover:text-gray-700 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
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
      {/* Desktop sidebar — sits below 56 px AppTopBar */}
      <aside
        aria-label="Main sidebar"
        className="hidden md:flex flex-col shrink-0 shadow-sm bg-white border-r border-gray-200"
        style={{
          position: "sticky",
          top: 56,
          height: "calc(100vh - 56px)",
          width: collapsed ? 64 : 224,
          transition: reducedMotion ? "none" : `width ${dur} ease`,
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
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          <div
            className="flex flex-col bg-white border-r border-gray-200 shadow-xl overflow-hidden"
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
