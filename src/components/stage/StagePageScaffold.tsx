"use client";

/**
 * Sprint 5 Phase 1 — Shared scaffold for stage pages.
 *
 * Every stage page (`/evaluate`, `/advise`, `/learn`, `/act`, `/achieve`)
 * follows the same shape:
 *   • Page-level loading skeleton while auth + cycle + notes load
 *   • Empty state when no active cycle (consistent across stages per P3-2)
 *   • Output panel rendered when notes exist
 *   • Run / Re-run button with inline confirmation (P3-3)
 *   • Inline error display in red
 *
 * Mirrors the CoachPageInner layout: max-w-5xl page wrapper, brand-600 CTA,
 * skeleton uses animate-pulse rounded-xl bg-gray-100.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface StagePageScaffoldProps {
  /** "Evaluate", "Career Advice", etc. — page header title */
  title:        string;
  /** Short subhead under the title. */
  subtitle:     string;
  /** "evaluate", "advise", etc. — used in confirmation copy. */
  stageLabel:   string;
  /** Top-level loading state. Renders skeleton when true. */
  loading:      boolean;
  /** When true (no active cycle), renders the standard empty state. */
  noCycle:      boolean;
  /** When true, the user's profile isn't complete enough — warn but allow run. */
  profileIncomplete?: boolean;
  /** Whether the user has already run this stage at least once. */
  hasOutput:    boolean;
  /** Optional inline error to display in a red card. */
  error?:       string | null;
  /** Disables the Run button while a request is in-flight. */
  running:      boolean;
  /** Plan-gate render — returned when present, overrides everything else. */
  planGate?:    ReactNode;
  /** Called when the user confirms "Run" (or "Re-run"). */
  onRun:        () => void | Promise<void>;
  /**
   * Sprint 5 P2-fix — Active cycle context shown above the output so the
   * user knows which cycle is being read. Users with >1 active cycle would
   * otherwise be confused when getActiveCycle returns the most recent one
   * silently.
   */
  cycleInfo?:   { cycleNumber: number; goal: string | null } | null;
  /** The actual output panel (rendered when hasOutput is true). */
  children?:    ReactNode;
}

const SKELETON = (
  <div className="space-y-4">
    <div className="h-10 w-1/3 animate-pulse rounded-xl bg-gray-100" />
    <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
    <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
  </div>
);

const EMPTY_NO_CYCLE = (
  <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
    <div className="text-4xl" aria-hidden>🎯</div>
    <h3 className="mt-3 text-lg font-semibold text-gray-900">No active cycle</h3>
    <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
      Start a cycle on your Career OS dashboard to unlock this stage.
    </p>
    <Link
      href="/dashboard"
      className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
    >
      Go to dashboard →
    </Link>
  </div>
);

export function StagePageScaffold(props: StagePageScaffoldProps) {
  const [confirming, setConfirming] = useState(false);

  // Sprint 5 P3-fix — when a run completes (running goes true → false),
  // collapse any confirmation prompt back to the Re-run button so the
  // user clearly sees the post-run state. Without this, certain React 18
  // batching orders could leave the prompt stuck visually even though the
  // run already ran.
  const prevRunning = useRef(false);
  useEffect(() => {
    if (prevRunning.current && !props.running) {
      setConfirming(false);
    }
    prevRunning.current = props.running;
  }, [props.running]);

  // P3-fix — visible "Last run just now / 5s ago" indicator so the user can
  // SEE that Re-run actually fired and the panel below them is fresh data.
  // Drives off the `hasOutput && !running` transition; using a millisecond
  // timestamp so we can render relative time below.
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  useEffect(() => {
    if (prevRunning.current && !props.running && props.hasOutput) {
      setLastRunAt(Date.now());
    }
  }, [props.running, props.hasOutput]);

  if (props.loading)         return SKELETON;
  if (props.planGate)        return <>{props.planGate}</>;
  if (props.noCycle)         return EMPTY_NO_CYCLE;

  // Output exists — render children, plus the Re-run control
  if (props.hasOutput) {
    return (
      <div className="space-y-6">
        {props.cycleInfo && <CycleContextBadge info={props.cycleInfo} />}
        {props.children}

        {/* Re-run with inline confirmation (P3-3) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {!confirming && !props.running && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600">
                  Generate a fresh {props.stageLabel} based on your latest profile data.
                </p>
                {lastRunAt && (
                  <p className="mt-1 text-xs text-emerald-700">
                    ✓ Just refreshed — output below reflects the latest run.
                  </p>
                )}
              </div>
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Re-run {props.stageLabel}
              </button>
            </div>
          )}
          {confirming && !props.running && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Re-running will <strong>replace your current {props.stageLabel} output</strong>. Continue?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirming(false); void props.onRun(); }}
                  className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Yes, re-run
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {props.running && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
              Running {props.stageLabel}…
            </p>
          )}
          {props.error && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {props.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // No output yet — show empty state with initial Run button
  return (
    <div className="space-y-5">
      {props.cycleInfo && <CycleContextBadge info={props.cycleInfo} />}
      {props.profileIncomplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your career profile isn't fully filled in yet. You can still run {props.stageLabel}, but{" "}
          <Link href="/mycareer/profile" className="underline font-medium">complete your profile</Link>{" "}
          first to get a more accurate result.
        </div>
      )}
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <h3 className="text-lg font-semibold text-gray-900">Run {props.stageLabel} for this cycle</h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Generate AI-powered insights tailored to your career profile and the cycle's goal.
        </p>
        <button
          onClick={() => void props.onRun()}
          disabled={props.running}
          className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {props.running ? "Running…" : `Run ${props.stageLabel}`}
        </button>
        {props.error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 inline-block">
            {props.error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Sprint 5 P2-fix — Small badge that tells the user which cycle's output
 * they're viewing. Important when the user has multiple active cycles —
 * useStageData picks the most recent via getActiveCycle, and without this
 * badge the user has no way to tell which one is rendered.
 */
function CycleContextBadge({ info }: { info: { cycleNumber: number; goal: string | null } }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600 flex items-center gap-2">
      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
        Cycle #{info.cycleNumber}
      </span>
      {info.goal && (
        <>
          <span className="text-gray-400">·</span>
          <span className="truncate">{info.goal}</span>
        </>
      )}
    </div>
  );
}
