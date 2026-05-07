"use client";

/**
 * CareerXpBadge — small XP + level display.
 *
 * Phase 4 Item 3 — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Pure presentation. Caller passes pre-aggregated totalXp (from
 * milestoneService.getCareerXp). Level rule: every 500 XP = 1 level,
 * base level 1. No gamification complexity.
 */

import { levelForXp } from "@/services/career-os/milestoneService";

export interface CareerXpBadgeProps {
  totalXp:    number;
  /** Optional override — defaults to levelForXp(totalXp) for consistency. */
  level?:     number;
  className?: string;
}

export function CareerXpBadge({ totalXp, level, className }: CareerXpBadgeProps) {
  const resolvedLevel = level ?? levelForXp(totalXp);
  const xpInLevel  = totalXp % 500;
  const xpToNext   = 500 - xpInLevel;

  return (
    <div
      className={"inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 " + (className ?? "")}
      data-testid="career-xp-badge"
    >
      <span className="text-xs font-bold text-brand-700">L{resolvedLevel}</span>
      <span className="text-xs text-gray-500">·</span>
      <span className="text-xs font-medium text-brand-800">{totalXp} XP</span>
      {totalXp > 0 && (
        <span className="text-[10px] text-gray-500">({xpToNext} to L{resolvedLevel + 1})</span>
      )}
    </div>
  );
}
