"use client";

/**
 * Sprint 5 hotfix (2026-05-15) — Reusable pill that lets the user push
 * a single skill onto `career_profiles.target_skills` with one click.
 *
 * Shared by /evaluate (skill gaps) and /learn (top gaps + resource
 * card skillsCovered) so the interaction looks identical everywhere.
 *
 * States:
 *   • Not added → coral pill with a tiny `+` badge, button.
 *   • Just added → teal pill with brief "Added" flash.
 *   • Already added → teal pill with checkmark, not interactive.
 */

import { useState } from "react";
import type { UseTargetSkills } from "./useTargetSkills";

export interface AddSkillPillProps {
  skill:        string;
  targetSkills: UseTargetSkills;
  /** Style preset — different colour for the two contexts. */
  variant?:     "gap" | "covered";
  /** Visual size; "sm" matches the covered-skills chips on /learn cards. */
  size?:        "md" | "sm";
}

const VARIANT_NOT_ADDED: Record<NonNullable<AddSkillPillProps["variant"]>, string> = {
  gap:     "bg-red-100  text-red-700  hover:bg-red-200",
  covered: "bg-teal-100 text-teal-800 hover:bg-teal-200",
};
const VARIANT_ADDED: Record<NonNullable<AddSkillPillProps["variant"]>, string> = {
  gap:     "bg-teal-100    text-teal-800",
  covered: "bg-emerald-100 text-emerald-800",
};
const SIZE_CLS: Record<NonNullable<AddSkillPillProps["size"]>, string> = {
  md: "px-2.5 py-1 text-xs",
  sm: "px-2 py-0.5 text-[10px]",
};
const PLUS_SIZE: Record<NonNullable<AddSkillPillProps["size"]>, string> = {
  md: "h-4 w-4 text-[11px]",
  sm: "h-3.5 w-3.5 text-[10px]",
};

export function AddSkillPill({
  skill,
  targetSkills,
  variant = "gap",
  size    = "md",
}: AddSkillPillProps) {
  const alreadyAdded = targetSkills.has(skill);
  const [busy,      setBusy] = useState(false);
  const [justAdded, setJust] = useState(false);

  async function handle() {
    if (alreadyAdded || busy) return;
    setBusy(true);
    const { added } = await targetSkills.add([skill]);
    setBusy(false);
    if (added.length > 0) {
      setJust(true);
      window.setTimeout(() => setJust(false), 2200);
    }
  }

  const baseSize = SIZE_CLS[size];

  if (alreadyAdded) {
    return (
      <span
        title="Already on your target skills"
        className={`inline-flex items-center gap-1 rounded-full font-medium ${VARIANT_ADDED[variant]} ${baseSize}`}
      >
        <span aria-hidden>✓</span>
        {skill}
        {justAdded && <span className="ml-1 text-[10px] font-semibold text-emerald-700">Added</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handle()}
      disabled={busy || targetSkills.loading}
      title="Add to your target skills"
      className={`inline-flex items-center gap-1 rounded-full font-medium ${VARIANT_NOT_ADDED[variant]} ${baseSize} disabled:opacity-60`}
    >
      {skill}
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-full bg-white/70 font-bold ${PLUS_SIZE[size]} ${variant === "gap" ? "text-red-700" : "text-teal-700"}`}
      >
        +
      </span>
    </button>
  );
}
