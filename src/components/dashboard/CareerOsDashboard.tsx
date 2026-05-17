"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient }    from "@/lib/supabase";
import { CycleStageCard }  from "./CycleStageCard";
import { CycleSummaryPanel } from "./CycleSummaryPanel";
import {
  startCycle,
  listActiveCycles,
  abandonCycle,
  getActiveCycle,
  advanceStage,
  completeCycle,
  type CareerOsStage,
} from "@/orchestrator/careerOsOrchestrator";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { CareerOsRing }    from "./CareerOsRing";
import { CoachBriefPanel } from "./CoachBriefPanel";
import { OnboardingCta }  from "./OnboardingCta";
import { emptyStateCta as computeEmptyStateCta } from "./emptyStateCta";
import { SkillsAssessment } from "@/components/evaluate/SkillsAssessment";
import { MilestoneList }  from "@/components/achieve/MilestoneList";
import { CareerXpBadge }  from "@/components/achieve/CareerXpBadge";
import { getCareerXp, type CareerXp } from "@/services/career-os/milestoneService";
import {
  STAGE_ORDER,
  buildStageStatus,
  emptyNotesMap,
  type StageNotesMap,
  type StageStatusMap,
  type CompletionSignals,
} from "./stageStatus";
import { getSubscription } from "@/services/billing/subscriptionService";
import type { SubscriptionPlan } from "@/services/billing/types";
import type { AchieveResult } from "@/services/ai/achieveService";
import type { EvaluationResult } from "@/services/ai/evaluateService";

/**
 * Sprint 5 Phase 2 — Dashboard 'Run' button + 'View details →' link
 * both route to the stage's dedicated page. Single source of truth
 * for those routes is right here so /coach (which has had its own page
 * since Sprint 3) stays consistent with /evaluate /advise /learn /act
 * /achieve added in Sprint 5 Phase 1.
 */
const STAGE_HREF: Record<CareerOsStage, string> = {
  evaluate: "/evaluate",
  advise:   "/advise",
  learn:    "/learn",
  act:      "/act",
  coach:    "/coach",
  achieve:  "/achieve",
};

interface ActiveCycle {
  id: string;
  cycle_number: number;
  goal: string | null;
  status: string;
  current_stage: string;
}

// Stage-status logic (STAGE_ORDER, buildStageStatus, emptyNotesMap, types)
// is in ./stageStatus — extracted in Phase 2 Item 3 so it can be unit-tested.

/** Load notes for all completed stages in a cycle */
async function loadStageNotes(cycleId: string): Promise<StageNotesMap> {
  const supabase = createClient();
  const { data } = await supabase
    .from("career_os_stages")
    .select("stage, notes")
    .eq("cycle_id", cycleId)
    .eq("status", "completed");

  const map = emptyNotesMap();
  if (data) {
    for (const row of data) {
      const stage = row.stage as CareerOsStage;
      if (stage in map && row.notes && typeof row.notes === "object") {
        map[stage] = row.notes as Record<string, unknown>;
      }
    }
  }
  return map;
}

/** Phase 4 Item 2b — fetch the user's top 10 skills for the assessment modal. */
async function loadTopSkillsForAssessment(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("career_profiles")
    .select("skills")
    .eq("user_id", userId)
    .maybeSingle();
  return Array.isArray(data?.skills) ? (data!.skills as string[]).slice(0, 10) : [];
}

/** Load completion signals for the dashboard's strict stage rules. */
async function loadCompletionSignals(userId: string): Promise<CompletionSignals> {
  const supabase = createClient();
  const [appsRes, oppsRes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  return {
    applicationsCount:  appsRes.count ?? 0,
    opportunitiesCount: oppsRes.count ?? 0,
  };
}

/**
 * UAT 2026-05-10: dashboard's onboarding CTA must hide ONLY when the
 * Career Profile is 100% complete by the same 7-check definition used on
 * /mycareer/profile (computeCompleteness):
 *   1. full_name        2. summary        3. skills.length > 0
 *   4. work_experience  5. education      6. certifications
 *   7. resume_versions row count > 0
 *
 * Previously this returned true at the lower "headline + skills >= 3"
 * threshold, so users at e.g. 60% completeness saw the CTA disappear too
 * early. The CTA now persists until every section is filled.
 *
 * The same record drives the CoachBriefPanel gate — gating the brief on
 * full completeness is fine: a profile with 7-of-7 has enough material
 * for any downstream stage to run.
 */
async function loadProfileReady(userId: string): Promise<boolean> {
  const supabase = createClient();
  const [cpRes, versionsRes] = await Promise.all([
    supabase
      .from("career_profiles")
      .select("full_name, summary, skills, work_experience, education, certifications")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("resume_versions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const cp = cpRes.data;
  if (!cp) return false;

  const fullName       = typeof cp.full_name === "string" ? cp.full_name.trim() : "";
  const summary        = typeof cp.summary   === "string" ? cp.summary.trim()   : "";
  const skills         = Array.isArray(cp.skills)          ? cp.skills          : [];
  const workExperience = Array.isArray(cp.work_experience) ? cp.work_experience : [];
  const education      = Array.isArray(cp.education)       ? cp.education       : [];
  const certifications = Array.isArray(cp.certifications)  ? cp.certifications  : [];
  const versionCount   = versionsRes.count ?? 0;

  return (
    fullName.length > 0 &&
    summary.length  > 0 &&
    skills.length         > 0 &&
    workExperience.length > 0 &&
    education.length      > 0 &&
    certifications.length > 0 &&
    versionCount          > 0
  );
}

function CycleManagementPanel({
  cycles, selectedId, onSwitch, onAbandon,
}: {
  cycles:     Array<{ id: string; cycle_number: number; goal: string | null; current_stage: string }>;
  selectedId: string;
  /** Called with the cycle being switched to so the parent can route to its current stage. */
  onSwitch:   (cycle: { id: string; current_stage: string }) => void;
  onAbandon:  (id: string) => Promise<void>;
}) {
  const [open, setOpen]           = useState(false);
  const [confirming, setConfirm]  = useState<string | null>(null);
  const [busy, setBusy]           = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Your active cycles ({cycles.length})
        </span>
        <span className="text-sm text-gray-400" aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {cycles.map((c) => {
            const selected = c.id === selectedId;
            const isConfirming = confirming === c.id;
            const isBusy = busy === c.id;
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-3 ${selected ? "bg-brand-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${selected ? "text-brand-700" : "text-gray-900"}`}>
                      Cycle #{c.cycle_number}
                    </span>
                    {selected && (
                      <span className="rounded-full bg-brand-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-800">
                        Selected
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">
                      stage: {c.current_stage}
                    </span>
                  </div>
                  {c.goal && (
                    <p className="text-xs text-gray-600 truncate mt-0.5" title={c.goal}>{c.goal}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!selected && !isConfirming && (
                    <button
                      type="button"
                      onClick={() => onSwitch({ id: c.id, current_stage: c.current_stage })}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                    >
                      Switch
                    </button>
                  )}
                  {!isConfirming ? (
                    <button
                      type="button"
                      onClick={() => setConfirm(c.id)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600">Abandon this cycle?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setBusy(c.id);
                          try { await onAbandon(c.id); }
                          finally { setBusy(null); setConfirm(null); }
                        }}
                        disabled={isBusy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isBusy ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirm(null)}
                        disabled={isBusy}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CareerOsDashboard() {
  const router = useRouter();
  const [userId, setUserId]           = useState<string | null>(null);
  // UAT 2026-05-10: ref-mirror of userId so the visibilitychange listener
  // can read the latest value without re-subscribing every render.
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  const [cycle, setCycle]             = useState<ActiveCycle | null>(null);
  const [activeCycles, setActiveCycles] = useState<Array<{ id: string; cycle_number: number; goal: string | null; status: string; current_stage: string; created_at: string }>>([]);
  const [stageStatus, setStageStatus] = useState<StageStatusMap>(buildStageStatus(null));
  const [stageNotes, setStageNotes]   = useState<StageNotesMap>(emptyNotesMap());
  const [signals, setSignals]         = useState<CompletionSignals>({ applicationsCount: 0, opportunitiesCount: 0 });
  /** Phase 4 Item 2b — controls the skills-assessment modal visibility. */
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  /** Top-10 skills passed to the assessment modal — sourced from career_profiles. */
  const [assessmentSkills, setAssessmentSkills] = useState<string[]>([]);
  /** Phase 4 Item 3 — total XP + level + recent milestones for the Achieve card */
  const [careerXp, setCareerXp] = useState<CareerXp>({ totalXp: 0, level: 1, recentMilestones: [] });
  /** Phase 5 Item 2 — gates the onboarding banner + CoachBriefPanel + Evaluate CTA */
  const [profileReady, setProfileReady] = useState<boolean>(true);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [plan, setPlan]               = useState<SubscriptionPlan>("free");
  const [error, setError]             = useState<string | null>(null);
  const [goal, setGoal]               = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);
  /** Set after completing a cycle — triggers the /profile hint banner */
  const [newCycleStarted, setNewCycleStarted] = useState(false);

  // Load user + active cycle + stage notes
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }

      const [activeCycle, sub, xp, ready] = await Promise.all([
        getActiveCycle(uid),
        getSubscription(),
        getCareerXp().catch(() => ({ totalXp: 0, level: 1, recentMilestones: [] })),
        loadProfileReady(uid),
      ]);
      setCareerXp(xp);
      setProfileReady(ready);

      setCycle(activeCycle);
      setPlan(sub?.plan ?? "free");

      // Load notes + completion signals BEFORE computing stage status —
      // completion is gated on notes (Phase 1) AND apps/opps counts (Phase 2 Item 3).
      const [notes, fetchedSignals] = await Promise.all([
        activeCycle ? loadStageNotes(activeCycle.id) : Promise.resolve(emptyNotesMap()),
        loadCompletionSignals(uid),
      ]);
      setStageNotes(notes);
      setSignals(fetchedSignals);
      setStageStatus(buildStageStatus(activeCycle, notes, fetchedSignals));

      setLoading(false);
    }).catch(() => {
      // Fail silently — show empty dashboard rather than crashing
      setLoading(false);
    });
  }, []);

  // UAT 2026-05-10: refresh profileReady when the tab regains focus, so
  // the onboarding banner disappears as soon as the user comes back from
  // /mycareer/profile with a freshly-completed profile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // userId is in a ref-like state — read latest.
      const uid = userIdRef.current;
      if (!uid) return;
      loadProfileReady(uid).then(setProfileReady).catch(() => { /* ignore */ });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

    const refreshCycle = useCallback(async (uid: string, preferCycleId?: string) => {
    const [list, fresh, ready] = await Promise.all([
      listActiveCycles(uid),
      getActiveCycle(uid),
      loadProfileReady(uid),
    ]);
    setProfileReady(ready);
    setActiveCycles(list);
    // If caller asked for a specific cycle (e.g. just-created), pick it.
    // Otherwise default to the freshest active cycle.
    const target = preferCycleId
      ? list.find(c => c.id === preferCycleId) ?? fresh
      : fresh;
    const [fetched, fetchedSignals] = await Promise.all([
      target ? loadStageNotes(target.id) : Promise.resolve(emptyNotesMap()),
      loadCompletionSignals(uid),
    ]);
    setCycle(target ?? null);
    setStageNotes(fetched);
    setSignals(fetchedSignals);
    setStageStatus(buildStageStatus(target ?? null, fetched, fetchedSignals));
  }, []);

  const handleStartCycle = useCallback(async () => {
    if (!userId) return;
    setRunning(true);
    setError(null);
    try {
      const result = await startCycle(userId, goal || undefined);
      if (result.status === "abandoned") {
        setError(result.error ?? "Failed to start cycle.");
      } else {
        // Switch view to the new cycle (in case user had others)
        await refreshCycle(userId, result.cycleId);
        setShowGoalInput(false);
        setGoal("");
      }
    } finally {
      setRunning(false);
    }
  }, [userId, goal, refreshCycle]);

  /**
   * Skip the current cycle without finishing it. Useful for roadmaps where
   * a user planned several cycles and decides one no longer applies (e.g.
   * already at that level, life pivot, market shift).
   */
  const handleSkipCycle = useCallback(async () => {
    if (!userId || !cycle) return;
    if (!window.confirm(
      `Skip Cycle #${cycle.cycle_number}${cycle.goal ? ` ("${cycle.goal}")` : ""}? You can always start another one. This won't be marked as completed.`
    )) return;
    setRunning(true);
    setError(null);
    try {
      await abandonCycle(userId, cycle.id, "user_skipped");
      // Reload — cycle list will drop this one; view switches to next active
      await refreshCycle(userId);
    } finally {
      setRunning(false);
    }
  }, [userId, cycle, refreshCycle]);

  /**
   * Start a parallel cycle WITHOUT closing the current one. The user may
   * pursue multiple goals on their roadmap simultaneously.
   */
  const handleStartParallelCycle = useCallback(async (parallelGoal: string) => {
    if (!userId) return;
    setRunning(true);
    setError(null);
    try {
      const result = await startCycle(userId, parallelGoal || undefined);
      if (result.status === "abandoned") {
        setError(result.error ?? "Failed to start cycle.");
      } else {
        // Switch view to the new cycle
        await refreshCycle(userId, result.cycleId);
        setShowGoalInput(false);
        setGoal("");
      }
    } finally {
      setRunning(false);
    }
  }, [userId, refreshCycle]);

  /**
   * @deprecated Sprint 5 Phase 2 — dashboard 'Run' now routes to the stage
   * page via router.push(STAGE_HREF[stage]) so the user sees the actual AI
   * output rendered. Kept here as the previous inline-execute path; underscore
   * prefix to silence noUnusedLocals.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps
  const _handleAdvanceStage = useCallback(async () => {
    if (!userId || !cycle) return;
    const currentStage = cycle.current_stage as CareerOsStage;
    setRunning(true);
    setError(null);
    try {
      const result = await advanceStage(userId, cycle.id, currentStage);
      if (result.error) {
        setError(result.error ?? "Failed to run " + currentStage + ".");
      } else {
        await refreshCycle(userId);
      }
    } finally {
      setRunning(false);
    }
  }, [userId, cycle, refreshCycle]);

  /**
   * Complete the current cycle and immediately start the next one.
   * If prefilledGoal is provided (from achieve recommendations), use it as
   * the goal for the new cycle. Otherwise fall back to the goal input.
   */
  const handleStartNextCycle = useCallback(async (prefilledGoal?: string) => {
    if (!userId || !cycle) return;
    setRunning(true);
    setError(null);
    try {
      // 1. Mark current cycle complete
      await completeCycle(userId, cycle.id);

      // 2. If a specific goal was passed use it, else show goal input
      if (prefilledGoal !== undefined) {
        const result = await startCycle(userId, prefilledGoal || undefined);
        if (result.status === "abandoned") {
          setError(result.error ?? "Failed to start next cycle.");
          return;
        }
        await refreshCycle(userId);
        setNewCycleStarted(true);
      } else {
        // No goal passed — clear cycle state and show goal input
        setCycle(null);
        setStageStatus(buildStageStatus(null));
        setStageNotes(emptyNotesMap());
        setSignals({ applicationsCount: 0, opportunitiesCount: 0 });
        // (buildStageStatus(null) returns all "pending" — notes + signals irrelevant.)
        setShowGoalInput(true);
      }
    } finally {
      setRunning(false);
    }
  }, [userId, cycle, refreshCycle]);

  // Phase 5 Item 2 — per-stage empty-state CTA. Logic lives in
  // ./emptyStateCta.ts so it can be unit-tested independently.
  function ctaForStage(stage: CareerOsStage) {
    return computeEmptyStateCta({
      stage,
      stageStatus,
      currentStage: cycle?.current_stage as CareerOsStage | undefined,
      profileReady,
      plan,
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  const currentStage  = cycle?.current_stage as CareerOsStage | undefined;
  const cycleComplete =
    currentStage === "achieve" && stageStatus.achieve === "completed";

  const achieveNotes = stageNotes.achieve
    ? (stageNotes.achieve as unknown as AchieveResult)
    : null;

  const evaluateNotes = stageNotes.evaluate
    ? (stageNotes.evaluate as unknown as EvaluationResult)
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Career OS</h2>
          <p className="mt-1 text-sm text-gray-500">
            Your AI-powered career operating system — Evaluate &rarr; Advise &rarr; Learn &rarr; Act &rarr; Coach &rarr; Achieve
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Phase 4 Item 3 — XP badge, hidden when no XP yet */}
          {careerXp.totalXp > 0 && (
            <CareerXpBadge totalXp={careerXp.totalXp} level={careerXp.level} />
          )}
          <PlanBadge plan={plan} />
          {/* Sprint 5 UX v2 (2026-05-16) — standalone outlined button at
              the top of the dashboard. Only shown when an active cycle
              exists; the empty-state below has its own "+ Start a cycle"
              CTA. */}
          {cycle && (
            <button
              onClick={() => setShowGoalInput(true)}
              disabled={running}
              title="Add a new cycle for a different goal — keeps your current cycle open"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              + New Cycle
            </button>
          )}
        </div>
      </div>

      {/* Phase 5 Item 2 — onboarding banner; renders only when profileReady=false */}
      <OnboardingCta profileReady={profileReady} hasActiveCycle={!!cycle} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* /profile hint — shown after a new cycle auto-starts */}
      {newCycleStarted && (
        <div
          data-testid="profile-hint-banner"
          className="flex items-start justify-between gap-4 rounded-xl border border-brand-200
                     bg-brand-50 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-brand-500 text-lg" aria-hidden="true">💡</span>
            <p className="text-sm text-brand-800">
              <span className="font-semibold">New cycle started.</span>{" "}
              Update your profile to give the Evaluate stage the freshest picture of where you are.
            </p>
          </div>
          <button
            onClick={() => router.push("/mycareer")}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold
                       text-white hover:bg-brand-700 transition-colors"
          >
            Update profile →
          </button>
        </div>
      )}

      {/* No active cycle */}
      {!cycle && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <div className="text-4xl">🎯</div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Start your career cycle</h3>
          <p className="mt-2 text-sm text-gray-500">
            Define a goal, then let AI guide you through each stage.
          </p>

          {showGoalInput ? (
            <div className="mt-6 space-y-3">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Land a Senior Product Manager role at a Series B startup"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                           focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                onKeyDown={(e) => e.key === "Enter" && handleStartCycle()}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleStartCycle}
                  disabled={running}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                             text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {running ? "Starting..." : "Start cycle"}
                </button>
                <button
                  onClick={() => setShowGoalInput(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowGoalInput(true)}
                className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-6 py-2.5
                           text-sm font-semibold text-white hover:bg-brand-700"
              >
                + Start a cycle
              </button>
              <p className="mt-3 text-xs text-gray-400">
                Not ready? You can also{" "}
                <a href="/mycareer/profile" className="underline hover:text-gray-600">build your profile</a>,{" "}
                <a href="/jobs" className="underline hover:text-gray-600">browse opportunities</a>, or{" "}
                <a href="/resumeadvisor" className="underline hover:text-gray-600">try the resume advisor</a>.
              </p>
            </>
          )}
        </div>
      )}

      {/* Active cycle */}
      {cycle && (
        <>
          {/* Six-stage ring (Phase 1 Item 2a) — honest stage completion */}
          <CareerOsRing
            stages={STAGE_ORDER.map(s => ({
              stage:    s,
              status:   stageStatus[s],
              hasNotes: stageNotes[s] !== null && typeof stageNotes[s] === "object" && Object.keys(stageNotes[s] ?? {}).length > 0,
            }))}
            currentStage={cycle.current_stage as CareerOsStage}
            onStageClick={(stage) => {
              // Phase 3 Item 4 — route the Coach stage node to the new /coach page.
              if (stage === "coach") router.push("/coach");
            }}
          />

          {showGoalInput && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm space-y-3">
              <p className="text-sm font-medium text-brand-900">Start a parallel cycle for a different goal:</p>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Become a Director of Engineering"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                onKeyDown={(e) => e.key === "Enter" && void handleStartParallelCycle(goal)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleStartParallelCycle(goal)}
                  disabled={running}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {running ? "Starting…" : "Start cycle"}
                </button>
                <button
                  onClick={() => { setShowGoalInput(false); setGoal(""); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="dashboard-milestone-section">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Career milestones</h3>
              {careerXp.totalXp > 0 && (
                <CareerXpBadge totalXp={careerXp.totalXp} level={careerXp.level} className="!py-0.5" />
              )}
            </div>
            {careerXp.recentMilestones.length > 0 ? (
              <MilestoneList milestones={careerXp.recentMilestones} compact />
            ) : (
              <p
                className="text-sm text-gray-500"
                data-testid="milestone-empty-state"
              >
                Your achievements will appear here.{" "}
                <a href="/offers" className="font-medium text-brand-700 hover:text-brand-900 underline">
                  Accept an offer
                </a>{" "}
                to earn your first milestone.
              </p>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAGE_ORDER.map((stage) => (
              <CycleStageCard
                key={stage}
                stage={stage}
                status={stageStatus[stage]}
                isCurrentStage={stage === currentStage && !cycleComplete}
                onRun={
                  // Sprint 5 Phase 2 — clicking "Run" on a stage card routes
                  // the user to the stage's dedicated page (where the actual
                  // Run button lives + the AI output renders). Keeps cycle
                  // control in one place per stage. Coach already worked this
                  // way; this brings the other 5 stages into parity.
                  stage === currentStage && !cycleComplete
                    // autorun-v2 (2026-05-17) — append ?autorun=1 so the
                    // stage page fires handleRun() automatically and the
                    // user doesn't have to double-click. The stage's
                    // useAutorunStage hook gates this on no-existing-
                    // output, so coming back to a stage with notes just
                    // shows the existing output silently.
                    ? () => router.push(STAGE_HREF[stage] + "?autorun=1")
                    : undefined
                }
                running={running}
                notes={stageNotes[stage]}
                emptyStateCta={ctaForStage(stage)}
                opportunitiesCount={signals.opportunitiesCount}
                onAssessmentRequested={
                  stage === "evaluate" && userId
                    ? async () => {
                        const top = await loadTopSkillsForAssessment(userId);
                        setAssessmentSkills(top);
                        setAssessmentOpen(true);
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {/* Sprint 5 UX v2 (2026-05-16) — Active-cycle indicator + multi-
              cycle switcher live BELOW the stage cards so the ring + cards
              have clean breathing room at the top. Goal label only (no
              "Cycle #N" prefix per Fix 1) — the #N badge is reserved for
              the dropdown rows where the user actually compares cycles. */}
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-sm gap-3">
              <div className="min-w-0">
                {cycle.goal ? (
                  <span className="font-medium text-gray-800 truncate">{cycle.goal}</span>
                ) : (
                  <span className="font-medium text-gray-500 italic">No goal set</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  Active
                </span>
                <button
                  onClick={() => void handleSkipCycle()}
                  disabled={running}
                  title="Skip this cycle without finishing it. Useful for roadmaps with optional steps."
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                >
                  Skip
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-brand-500 transition-all"
                  style={{
                    width: Math.round(
                      ((STAGE_ORDER.indexOf(currentStage ?? "evaluate") + 1) /
                        STAGE_ORDER.length) * 100
                    ) + "%",
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Stage {STAGE_ORDER.indexOf(currentStage ?? "evaluate") + 1} of {STAGE_ORDER.length}
              </p>
            </div>

            {/* Multi-cycle switcher — only renders when user has 2+ active
                cycles. The dropdown rows DO show the "Cycle #N" badge for
                disambiguation, per the Fix 1 carve-out. */}
            {activeCycles.length > 1 && (
              <CycleManagementPanel
                cycles={activeCycles}
                selectedId={cycle.id}
                onSwitch={(c) => {
                  if (!userId) return;
                  void (async () => {
                    await refreshCycle(userId, c.id);
                    const stage = c.current_stage as CareerOsStage;
                    const href = STAGE_HREF[stage];
                    if (href) router.push(href);
                  })();
                }}
                onAbandon={async (id) => {
                  if (!userId) return;
                  const sb = createClient();
                  await sb
                    .from("career_os_cycles")
                    .update({ status: "abandoned" })
                    .eq("id", id)
                    .eq("user_id", userId);
                  await refreshCycle(userId);
                }}
              />
            )}
          </section>

          {/* On-demand coaching brief — now below the active-cycle indicator
              per Sprint 5 UX v2 (2026-05-16). */}
          <CoachBriefPanel
            cycleId={cycle.id}
            plan={plan}
            profileReady={profileReady}
            initial={
              stageNotes.coach && typeof stageNotes.coach === "object"
                && (stageNotes.coach as Record<string, unknown>).brief
                && typeof (stageNotes.coach as Record<string, unknown>).brief === "object"
                ? {
                    content:     ((stageNotes.coach as Record<string, unknown>).brief as { content?: unknown }).content as string ?? "",
                    generatedAt: ((stageNotes.coach as Record<string, unknown>).brief as { generatedAt?: unknown }).generatedAt as string ?? "",
                  }
                : null
            }
          />

          {/* Phase 4 Item 2b — Skills assessment modal */}
          {assessmentOpen && cycle && (
            <SkillsAssessment
              cycleId={cycle.id}
              skills={assessmentSkills}
              onClose={() => setAssessmentOpen(false)}
              onSaved={() => {
                // Re-load notes to reflect the new assessment block; once
                // `notes.assessment` is present, the strict completion rule
                // upgrades the Evaluate stage to `completed` automatically.
                if (userId) void refreshCycle(userId, cycle.id);
              }}
            />
          )}

          {/* Cycle complete — show summary panel */}
          {cycleComplete && (
            <CycleSummaryPanel
              cycleNumber={cycle.cycle_number}
              goal={cycle.goal}
              achieveNotes={achieveNotes}
              evaluateNotes={evaluateNotes}
              onStartNextCycle={handleStartNextCycle}
              running={running}
            />
          )}
        </>
      )}
    </div>
  );
}
