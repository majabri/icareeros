"use client";

/**
 * Sprint 5 hotfix (2026-05-15) — Reusable pill that lets the user push
 * a single skill onto EITHER `career_profiles.target_skills` ("want to
 * learn this") OR `career_profiles.skills` ("already have this") —
 * independently. Both, either, or neither.
 *
 * Shared by /evaluate (skill gaps), /advise (CareerPath gapSkills), and
 * /learn (top gaps + resource-card skillsCovered) so the interaction is
 * identical everywhere.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │ <skill_text>   [🎯 / ✓ teal]   [✅ / ✓ green]    │
 *   └─────────────────────────────────────────────────┘
 *
 * 🎯 button — target_skills (I want to learn this)
 *   • Default: muted gray bg with 🎯
 *   • Added:   teal-100 bg with ✓ (and short "Just added" flash)
 *
 * ✅ button — skills (I already have this)
 *   • Default: muted gray bg with ✅
 *   • Added:   emerald-100 bg with ✓ (and short "Just added" flash)
 */

import { useState } from "react";
import type { UseTargetSkills }  from "./useTargetSkills";
import type { UseProfileSkills } from "./useProfileSkills";

export interface AddSkillPillProps {
  skill:         string;
  targetSkills:  UseTargetSkills;
  profileSkills: UseProfileSkills;
  /** Visual context — drives the pill's base background. */
  variant?:      "gap" | "covered";
  /** Pill size — "sm" matches the covered-skills chips on /learn cards. */
  size?:         "md" | "sm";
}

const PILL_BASE: Record<NonNullable<AddSkillPillProps["variant"]>, string> = {
  gap:     "bg-red-50  text-red-700",
  covered: "bg-gray-50 text-gray-700",
};

const SIZE_CLS: Record<NonNullable<AddSkillPillProps["size"]>, string> = {
  md: "px-2.5 py-1 text-xs",
  sm: "px-2 py-0.5 text-[10px]",
};

const ICON_BTN_SIZE: Record<NonNullable<AddSkillPillProps["size"]>, string> = {
  md: "h-5 min-w-[1.25rem] text-[11px]",
  sm: "h-4 min-w-[1rem]    text-[9px]",
};

export function AddSkillPill({
  skill,
  targetSkills,
  profileSkills,
  variant = "gap",
  size    = "md",
}: AddSkillPillProps) {
  const inTarget  = targetSkills.has(skill);
  const inProfile = profileSkills.has(skill);

  const [busyT, setBusyT] = useState(false);
  const [busyP, setBusyP] = useState(false);
  const [justT, setJustT] = useState(false);
  const [justP, setJustP] = useState(false);

  async function addToTarget() {
    if (inTarget || busyT) return;
    setBusyT(true);
    const { added } = await targetSkills.add([skill]);
    setBusyT(false);
    if (added.length > 0) {
      setJustT(true);
      window.setTimeout(() => setJustT(false), 2200);
    }
  }

  async function addToProfile() {
    if (inProfile || busyP) return;
    setBusyP(true);
    const { added } = await profileSkills.add([skill]);
    setBusyP(false);
    if (added.length > 0) {
      setJustP(true);
      window.setTimeout(() => setJustP(false), 2200);
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${PILL_BASE[variant]} ${SIZE_CLS[size]}`}
    >
      <span>{skill}</span>
      <ActionButton
        active={inTarget}
        justFlashed={justT}
        busy={busyT}
        onClick={addToTarget}
        addedTitle="Already on target skills"
        addTitle="Add to target skills (I want to learn this)"
        addIcon="🎯"
        activeBg="bg-teal-100 text-teal-800"
        sizeCls={ICON_BTN_SIZE[size]}
      />
      <ActionButton
        active={inProfile}
        justFlashed={justP}
        busy={busyP}
        onClick={addToProfile}
        addedTitle="Already on your profile"
        addTitle="Add to profile (I already have this)"
        addIcon="✅"
        activeBg="bg-emerald-100 text-emerald-800"
        sizeCls={ICON_BTN_SIZE[size]}
      />
    </span>
  );
}

/**
 * One of the two per-skill action buttons. Renders the add-icon by
 * default; flips to a solid-colored ✓ when the parent reports the
 * skill is already present.
 */
function ActionButton({
  active,
  justFlashed,
  busy,
  onClick,
  addedTitle,
  addTitle,
  addIcon,
  activeBg,
  sizeCls,
}: {
  active:       boolean;
  justFlashed:  boolean;
  busy:         boolean;
  onClick:      () => void | Promise<void>;
  addedTitle:   string;
  addTitle:     string;
  addIcon:      string;
  activeBg:     string;
  sizeCls:      string;
}) {
  if (active) {
    return (
      <span
        title={addedTitle}
        aria-label={addedTitle}
        className={`inline-flex items-center justify-center rounded-full px-1 font-bold ${activeBg} ${sizeCls}`}
      >
        <span aria-hidden>✓</span>
        {justFlashed && (
          <span className="ml-1 text-[9px] font-semibold uppercase tracking-wider">added</span>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      title={addTitle}
      aria-label={addTitle}
      className={`inline-flex items-center justify-center rounded-full px-1 bg-white/80 hover:bg-white text-gray-700 hover:text-gray-900 border border-gray-200 disabled:opacity-50 ${sizeCls}`}
    >
      {busy ? <span aria-hidden>…</span> : <span aria-hidden>{addIcon}</span>}
    </button>
  );
}
