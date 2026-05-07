"use client";

/**
 * MilestoneList — renders the user's recent career milestones.
 *
 * Phase 4 Item 3 — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Dropped onto the dashboard's Achieve card and on the Offer Desk page.
 * Pure presentation — caller supplies the array.
 */

import type { Milestone, MilestoneType } from "@/services/career-os/milestoneService";

const TYPE_LABEL: Record<MilestoneType, string> = {
  offer_accepted: "Offer accepted",
  promotion:      "Promotion",
  certification:  "Certification",
  cycle_complete: "Cycle complete",
  manual:         "Milestone",
};

const TYPE_ICON: Record<MilestoneType, string> = {
  offer_accepted: "🎯",
  promotion:      "📈",
  certification:  "🎓",
  cycle_complete: "🏁",
  manual:         "🏷️",
};

const TYPE_COLOR: Record<MilestoneType, string> = {
  offer_accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  promotion:      "border-brand-200 bg-brand-50 text-brand-800",
  certification:  "border-amber-200 bg-amber-50 text-amber-800",
  cycle_complete: "border-purple-200 bg-purple-50 text-purple-800",
  manual:         "border-gray-200 bg-gray-50 text-gray-700",
};

export interface MilestoneListProps {
  milestones: Milestone[];
  /** When true, only show the latest 3 — useful for compact dashboard cards. */
  compact?:   boolean;
  className?: string;
}

export function MilestoneList({ milestones, compact, className }: MilestoneListProps) {
  const items = compact ? milestones.slice(0, 3) : milestones;

  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic" data-testid="milestone-list-empty">
        No milestones yet — accept an offer or log a promotion to start your XP journey.
      </p>
    );
  }

  return (
    <ul className={"space-y-1.5 " + (className ?? "")} data-testid="milestone-list">
      {items.map((m) => (
        <li
          key={m.id}
          className={"rounded-lg border px-3 py-2 " + (TYPE_COLOR[m.type] ?? TYPE_COLOR.manual)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base shrink-0" aria-hidden="true">{TYPE_ICON[m.type] ?? TYPE_ICON.manual}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{m.title}</p>
                {m.description && (
                  <p className="mt-0.5 text-[11px] text-gray-600 truncate">{m.description}</p>
                )}
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {TYPE_LABEL[m.type] ?? "Milestone"} · {new Date(m.achieved_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            {m.xp_awarded > 0 && (
              <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">
                +{m.xp_awarded} XP
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
