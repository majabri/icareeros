"use client";

/**
 * Sprint 5 UX (2026-05-16) — Auto-run a stage when navigated to with
 * `?autorun=1`.
 *
 * The dashboard's per-stage "Run" button passes `?autorun=1` so the user
 * doesn't have to double-click (once on the dashboard, once on the stage
 * page). On mount, if the query flag is set AND there's no existing
 * output AND the cycle is loaded AND nothing is already running, fire
 * `handleRun()` exactly once. The flag is consumed via a ref — subsequent
 * re-renders won't re-trigger it, and the user can always rerun manually
 * via the page's own button.
 *
 * Quietly does nothing when:
 *   - the page already has output (re-run scenario — let the user decide)
 *   - the cycle is still loading or absent
 *   - `?autorun=1` was never passed
 *
 * The hook returns nothing; it's pure side-effect.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export interface UseAutorunStageInput {
  /** True once the page's useStageData loader has finished. */
  ready:    boolean;
  /** True if the stage already has persisted output for this cycle. */
  hasOutput: boolean;
  /** True while a manual or auto-run request is in-flight. */
  running:  boolean;
  /** Callback that fires the AI run for this stage. */
  onRun:    () => void | Promise<void>;
}

export function useAutorunStage({
  ready,
  hasOutput,
  running,
  onRun,
}: UseAutorunStageInput): void {
  const params = useSearchParams();
  const autorun = params?.get("autorun") === "1";

  // Latch — ensure we fire at most once per page mount, even if React
  // strict-mode replays effects or props change after the first run.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!autorun)        return;
    if (!ready)          return;
    if (hasOutput)       return;
    if (running)         return;

    firedRef.current = true;
    void onRun();
    // We intentionally only depend on values that gate the first fire.
    // `onRun` is captured at fire-time; capturing it in deps would
    // re-trigger if the page re-creates the callback on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorun, ready, hasOutput, running]);
}
