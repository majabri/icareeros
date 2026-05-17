"use client";

/**
 * Sprint 5 add-on — Cycle switcher pill rendered at the top of every
 * stage page (`/evaluate`, `/advise`, `/learn`, `/act`, `/achieve`).
 *
 * Behaviour
 * ─────────
 * • Loads all active cycles for the authenticated user from
 *   `career_os_cycles` where status='active', ordered by cycle_number desc.
 * • If only 1 active cycle: renders nothing (hidden).
 * • If 2+ active cycles: renders a compact pill showing the active
 *   cycle's number + goal, with a dropdown of every active cycle.
 * • Selecting a different cycle routes the user to that cycle's
 *   `current_stage` page via STAGE_HREF — so switching mid-stage on
 *   /evaluate (current_stage="advise") lands the user on /advise.
 *
 * Visual style matches the dashboard's CycleManagementPanel pill so the
 * affordance feels familiar.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listActiveCycles, type CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

// Shared route map — mirrors STAGE_HREF in CareerOsDashboard.tsx. Kept
// duplicated rather than imported because the dashboard module is heavy
// and we want stage pages to pull as little as possible into the bundle.
const STAGE_HREF: Record<CareerOsStage, string> = {
  evaluate: "/evaluate",
  advise:   "/advise",
  learn:    "/learn",
  act:      "/act",
  coach:    "/coach",
  achieve:  "/achieve",
};

interface ActiveCycle {
  id:            string;
  cycle_number:  number;
  goal:          string | null;
  status:        string;
  current_stage: string;
  created_at:    string;
}

export interface CycleSwitcherProps {
  /** The cycle currently being viewed on this stage page. */
  cycleId: string | null;
  /** Authenticated user id — used to scope the active-cycle query. */
  userId:  string | null;
}

const STAGE_LABEL: Record<CareerOsStage, string> = {
  evaluate: "Evaluate",
  advise:   "Advise",
  learn:    "Learn",
  act:      "Act",
  coach:    "Coach",
  achieve:  "Achieve",
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export function CycleSwitcher({ cycleId, userId }: CycleSwitcherProps) {
  const router = useRouter();
  const [cycles, setCycles] = useState<ActiveCycle[]>([]);
  const [open,   setOpen]   = useState(false);
  const containerRef        = useRef<HTMLDivElement | null>(null);

  // Load active cycles once we have a user id.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const list = await listActiveCycles(userId);
      if (!cancelled) setCycles(list);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const root = containerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Hidden until we have data + the user has multiple cycles to switch
  // between. Single-cycle pages are unchanged.
  if (cycles.length < 2) return null;

  const active = cycles.find((c) => c.id === cycleId) ?? cycles[0];

  function pickCycle(c: ActiveCycle) {
    setOpen(false);
    if (c.id === cycleId) return;
    const stage = c.current_stage as CareerOsStage;
    const href = STAGE_HREF[stage] ?? "/dashboard";
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
          Cycle #{active.cycle_number}
        </span>
        <span className="max-w-[18rem] truncate text-gray-700">
          {active.goal ? truncate(active.goal) : "(no goal)"}
        </span>
        <span aria-hidden className="text-gray-400">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-[22rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Switch active cycle ({cycles.length})
          </p>
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {cycles.map((c) => {
              const selected   = c.id === cycleId;
              const stageLabel = STAGE_LABEL[c.current_stage as CareerOsStage] ?? c.current_stage;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pickCycle(c)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${selected ? "bg-brand-50" : ""}`}
                  >
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${selected ? "bg-brand-200 text-brand-800" : "bg-gray-100 text-gray-700"}`}>
                      Cycle #{c.cycle_number}
                    </span>
                    <span className={`flex-1 truncate ${selected ? "font-semibold text-brand-800" : "text-gray-800"}`}>
                      {c.goal ? truncate(c.goal) : "(no goal)"}
                    </span>
                    <span className="shrink-0 rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {stageLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-gray-100 px-3 py-2 text-right">
            <Link href="/dashboard" className="text-[11px] text-brand-700 underline">
              Manage cycles →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
