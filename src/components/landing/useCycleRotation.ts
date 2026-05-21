"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useCycleRotation — drives a cycle's current-stage state, advancing
 * through `stageCount` stages on the schedule defined by `durations`
 * (an array of N stage dwell times in milliseconds).
 *
 * Design notes:
 *   - One useEffect with empty deps. The advancement timer is held in a
 *     ref and re-armed via a recursive setTimeout callback that reads
 *     the *latest* paused/stage values via refs. This avoids React's
 *     re-mount-on-state-change pattern that can drop ticks or cause
 *     double-advancement on quick re-renders.
 *   - Pause-on-hover is implemented through a ref the consumer updates
 *     via the returned `setPaused`. The timer polls (`100ms`) while
 *     paused so resuming is responsive.
 *   - `prefers-reduced-motion` is honored once on mount; users with it
 *     enabled never get auto-advance, but the returned `setCurrent`
 *     still lets cards advance manually on click.
 *   - The consumer can override the current stage at any time (e.g. by
 *     clicking a stage card); the timer naturally re-arms with that
 *     stage's duration on the next tick.
 *
 * Per Amir 2026-05-20.
 */
export function useCycleRotation(stageCount: number, durations: readonly number[]) {
  const [current, setCurrentState] = useState(0);
  const currentRef = useRef(0);
  const pausedRef = useRef(false);

  // Keep refs in sync with state for the timer callback.
  const setCurrent = useCallback((next: number) => {
    currentRef.current = next;
    setCurrentState(next);
  }, []);

  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
  }, []);

  useEffect(() => {
    // Honor reduced-motion once on mount. Manual clicks still work.
    if (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      // While paused, re-check every 100ms — keeps resume responsive
      // without burning frames.
      if (pausedRef.current) {
        timeoutId = setTimeout(tick, 100);
        return;
      }

      // Advance one stage, wrapping back to 0 after the last.
      const next = (currentRef.current + 1) % stageCount;
      currentRef.current = next;
      setCurrentState(next);

      // Re-arm with the NEW current stage's dwell.
      const dwell = durations[next] ?? 2000;
      timeoutId = setTimeout(tick, dwell);
    };

    // Initial wait is for stage 0's dwell.
    const initialDwell = durations[0] ?? 2000;
    timeoutId = setTimeout(tick, initialDwell);

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { current, setCurrent, setPaused };
}
