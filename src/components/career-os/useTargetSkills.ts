"use client";

/**
 * Sprint 5 hotfix (2026-05-15) — Client-side hook that owns the user's
 * `career_profiles.target_skills` set. Used by /evaluate's gap pills and
 * /learn's resource cards so the user can add gap/resource skills to
 * their target list with a single click.
 *
 * Loads once on mount from GET /api/career-os/add-target-skill, then
 * applies optimistic updates: adds skills to local state immediately
 * and reconciles with the server response (or reverts on error).
 *
 * Dedupe is case-insensitive (matches the server) and is exposed via
 * `has(skill)` so pills can render a checkmark vs `+` button.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseTargetSkills {
  /** All target skills currently on the user's profile (preserved casing). */
  skills:    string[];
  /** Case-insensitive containment check — for rendering pill state. */
  has:       (skill: string) => boolean;
  /** Add one or many skills. Returns the server response (added/skipped). */
  add:       (skills: string[]) => Promise<{ added: string[]; skipped: string[] }>;
  /**
   * Sprint 5 hotfix (2026-05-15) — Remove one or many skills from
   * target_skills. Used as the cross-hook callback when the user marks
   * a skill as "I already have this" via ✅ on the dual-button pill;
   * the server-side add-profile-skill route already removes the same
   * skills atomically, so this call is idempotent. Returns the server
   * response (which skills were actually removed).
   */
  remove:    (skills: string[]) => Promise<{ removed: string[]; skipped: string[] }>;
  /** True while the initial GET is in flight. */
  loading:   boolean;
  /** Most recent error from a failed add/remove (null if last call succeeded). */
  error:     string | null;
}

export function useTargetSkills(): UseTargetSkills {
  const [skills,  setSkills]  = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/career-os/add-target-skill", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = await res.json() as { target_skills?: string[] };
        if (!cancelled) {
          setSkills(Array.isArray(json.target_skills) ? json.target_skills : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const skillsLower = useMemo(
    () => new Set(skills.map((s) => s.toLowerCase().trim())),
    [skills],
  );

  const has = useCallback(
    (skill: string) => skillsLower.has(skill.toLowerCase().trim()),
    [skillsLower],
  );

  const add = useCallback(async (incoming: string[]): Promise<{ added: string[]; skipped: string[] }> => {
    const lowerNow = new Set(skills.map((s) => s.toLowerCase().trim()));
    const seenBatch = new Set<string>();
    const optimisticNew: string[] = [];
    for (const raw of incoming) {
      const t = raw.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (!lowerNow.has(k) && !seenBatch.has(k)) {
        optimisticNew.push(t);
        seenBatch.add(k);
      }
    }

    if (optimisticNew.length > 0) {
      setSkills((prev) => [...prev, ...optimisticNew]);
    }

    setError(null);

    try {
      const res = await fetch("/api/career-os/add-target-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ skills: incoming }),
      });
      const json = await res.json().catch(() => ({})) as {
        added?: string[]; skipped?: string[]; target_skills?: string[]; error?: string;
      };
      if (!res.ok) {
        if (optimisticNew.length > 0) {
          const revertKeys = new Set(optimisticNew.map((s) => s.toLowerCase()));
          setSkills((prev) => prev.filter((s) => !revertKeys.has(s.toLowerCase())));
        }
        setError(json.error ?? `Could not add skill${incoming.length === 1 ? "" : "s"}.`);
        return { added: [], skipped: incoming };
      }
      if (Array.isArray(json.target_skills)) {
        setSkills(json.target_skills);
      }
      return {
        added:   Array.isArray(json.added)   ? json.added   : optimisticNew,
        skipped: Array.isArray(json.skipped) ? json.skipped : [],
      };
    } catch (e) {
      if (optimisticNew.length > 0) {
        const revertKeys = new Set(optimisticNew.map((s) => s.toLowerCase()));
        setSkills((prev) => prev.filter((s) => !revertKeys.has(s.toLowerCase())));
      }
      setError(e instanceof Error ? e.message : "Network error — try again.");
      return { added: [], skipped: incoming };
    }
  }, [skills]);

  const remove = useCallback(async (incoming: string[]): Promise<{ removed: string[]; skipped: string[] }> => {
    const lowerDrop = new Set(incoming.map((s) => s.toLowerCase().trim()).filter(Boolean));
    if (lowerDrop.size === 0) return { removed: [], skipped: [] };

    // Optimistic — drop from local state immediately.
    const dropped: string[] = [];
    setSkills((prev) => {
      const next: string[] = [];
      for (const s of prev) {
        if (lowerDrop.has(s.toLowerCase().trim())) {
          dropped.push(s);
        } else {
          next.push(s);
        }
      }
      return next;
    });

    setError(null);

    try {
      const res = await fetch("/api/career-os/remove-target-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ skills: incoming }),
      });
      const json = await res.json().catch(() => ({})) as {
        removed?: string[]; skipped?: string[]; target_skills?: string[]; error?: string;
      };
      if (!res.ok) {
        // Revert optimistic drop.
        if (dropped.length > 0) {
          setSkills((prev) => [...prev, ...dropped]);
        }
        setError(json.error ?? `Could not remove skill${incoming.length === 1 ? "" : "s"}.`);
        return { removed: [], skipped: incoming };
      }
      if (Array.isArray(json.target_skills)) {
        setSkills(json.target_skills);
      }
      return {
        removed: Array.isArray(json.removed) ? json.removed : dropped,
        skipped: Array.isArray(json.skipped) ? json.skipped : [],
      };
    } catch (e) {
      if (dropped.length > 0) {
        setSkills((prev) => [...prev, ...dropped]);
      }
      setError(e instanceof Error ? e.message : "Network error — try again.");
      return { removed: [], skipped: incoming };
    }
  }, []);

  return { skills, has, add, remove, loading, error };
}
