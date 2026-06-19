"use client";

import { Suspense, useState } from "react";
import { AdvisePageInner } from "./AdvisePageInner";
import { CoachPageInner }  from "./CoachPageInner";

type Tab = "paths" | "coach";

/**
 * /advise sub-nav: two-tab switcher for Career Paths (default) and AI Coach.
 *
 * 2026-06-18 (T-022) — AI Coach folded from its own /aicoach route into
 * this tab. /aicoach 404s; sidebar entry removed. The Coach context panel
 * + chat window mount in-place when this tab is active so route changes
 * never tear down the chat state mid-session.
 */
export function AdviseTabs({ defaultTab = "paths" }: { defaultTab?: Tab }) {
  const [active, setActive] = useState<Tab>(defaultTab);

  return (
    <>
      <nav
        className="mt-4 flex gap-1 border-b border-gray-200"
        aria-label="Advise sub-navigation"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active === "paths"}
          onClick={() => setActive("paths")}
          className={
            "border-b-2 px-4 py-2 text-sm font-semibold transition-colors " +
            (active === "paths"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          Career Paths
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "coach"}
          onClick={() => setActive("coach")}
          className={
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors " +
            (active === "coach"
              ? "border-brand-500 text-brand-700 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          AI Coach
        </button>
      </nav>

      <div className="mt-6" role="tabpanel">
        {active === "paths" ? (
          <Suspense fallback={null}>
            <AdvisePageInner />
          </Suspense>
        ) : (
          <CoachPageInner />
        )}
      </div>
    </>
  );
}
