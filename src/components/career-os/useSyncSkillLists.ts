"use client";

/**
 * Sprint 5 hotfix (2026-05-15) — One-shot cleanup of stale data in
 * `career_profiles.target_skills`.
 *
 * Background: the dual-button pill on /evaluate, /advise, and /learn
 * enforces "a skill on the profile is no longer a target" at the moment
 * the user clicks ✅. But rows existed in production BEFORE that rule
 * was added — same skill present in both `skills` and `target_skills`.
 * That stale overlap renders as "✓ on both buttons" and looks weird.
 *
 * This hook runs once per page-mount, after BOTH useTargetSkills and
 * useProfileSkills finish their initial GET, and clears any overlap by
 * calling targetSkills.remove(overlap). Idempotent — when there's no
 * overlap it's a no-op; when there is, it's one POST to the
 * remove-target-skill endpoint and an optimistic local-state update.
 *
 * Safe to call from every page that uses the dual-pill component.
 */

import { useEffect, useRef } from "react";
import type { UseTargetSkills }  from "./useTargetSkills";
import type { UseProfileSkills } from "./useProfileSkills";

export function useSyncSkillLists(
  targetSkills:  UseTargetSkills,
  profileSkills: UseProfileSkills,
): void {
  const ranRef = useRef(false);
  const bothLoaded = !targetSkills.loading && !profileSkills.loading;

  useEffect(() => {
    if (ranRef.current || !bothLoaded) return;
    ranRef.current = true;

    const profileLower = new Set(
      profileSkills.skills.map((s) => s.toLowerCase().trim()),
    );
    const overlap = targetSkills.skills.filter((t) =>
      profileLower.has(t.toLowerCase().trim()),
    );

    if (overlap.length > 0) {
      void targetSkills.remove(overlap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothLoaded]);
}
