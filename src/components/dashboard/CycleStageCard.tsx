"use client";

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";
import type { EvaluationResult } from "@/services/ai/evaluateService";
import type { AdviceResult } from "@/services/ai/adviseService";
import type { LearnResult } from "@/services/ai/learnService";
import type { ActResult } from "@/services/ai/actService";
import type { CoachResult } from "@/services/ai/coachService";
import type { AchieveResult } from "@/services/ai/achieveService";

interface StageConfig {
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
}

const STAGE_CONFIG: Record<CareerOsStage, StageConfig> = {
  evaluate: {
    label: "Evaluate",
    description: "Assess your skills, gaps, and market fit",
    icon: "🔍",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
  },
  advise: {
    label: "Advise",
    description: "Get AI-powered career path recommendations",
    icon: "💡",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  learn: {
    label: "Learn",
    description: "Acquire the skills your target role demands",
    icon: "📚",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
  },
  act: {
    label: "Act",
    description: "Apply, network, and build real-world experience",
    icon: "🚀",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  coach: {
    label: "Coach",
    description: "Interview prep, resume polish, and accountability",
    icon: "🎯",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
  },
  achieve: {
    label: "Achieve",
    description: "Land the role, promotion, or milestone",
    icon: "🏆",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
  },
};

type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

interface CycleStageCardProps {
  stage: CareerOsStage;
  status: StageStatus;
  isCurrentStage: boolean;
  onRun?: () => void;
  running?: boolean;
  /** Stage result notes persisted by stageRouter (only meaningful when completed) */
  notes?: Record<string, unknown> | null;
}

// Resource type label → short display label
const RESOURCE_TYPE_LABEL: Record<string, string> = {
  course:        "Course",
  certification: "Cert",
  book:          "Book",
  video:         "Video",
  article:       "Article",
  mentorship:    "Mentorship",
};

export function CycleStageCard({
  stage,
  status,
  isCurrentStage,
  onRun,
  running = false,
  notes,
}: CycleStageCardProps) {
  const config = STAGE_CONFIG[stage];

  const statusBadge: Record<StageStatus, { label: string; class: string }> = {
    pending:     { label: "Pending",     class: "bg-gray-100 text-gray-500" },
    in_progress: { label: "In Progress", class: "bg-brand-100 text-brand-700" },
    completed:   { label: "Done",        class: "bg-green-100 text-green-700" },
    skipped:     { label: "Skipped",     class: "bg-gray-100 text-gray-400" },
  };

  const badge = statusBadge[status];

  // ── Evaluate notes ──────────────────────────────────────────────────────
  const evalResult: EvaluationResult | null =
    stage === "evaluate" && status === "completed" && notes
      ? (notes as unknown as EvaluationResult)
      : null;

  const scoreColor = evalResult
    ? evalResult.marketFitScore >= 70 ? "text-green-700 bg-green-50"
      : evalResult.marketFitScore >= 45 ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50"
    : "";

  // ── Advise notes ────────────────────────────────────────────────────────
  const adviceResult: AdviceResult | null =
    stage === "advise" && status === "completed" && notes
      ? (notes as unknown as AdviceResult)
      : null;

  const topPath = adviceResult?.recommendedPaths?.[0] ?? null;
  const topPathScoreColor = topPath
    ? topPath.matchScore >= 70 ? "text-green-700 bg-green-50"
      : topPath.matchScore >= 45 ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50"
    : "";

  // ── Learn notes ─────────────────────────────────────────────────────────
  const learnResult: LearnResult | null =
    stage === "learn" && status === "completed" && notes
      ? (notes as unknown as LearnResult)
      : null;

  const topResources = learnResult?.resources?.slice(0, 3) ?? [];

  // ── Act notes ───────────────────────────────────────────────────────────
  const actResult: ActResult | null =
    stage === "act" && status === "completed" && notes
      ? (notes as unknown as ActResult)
      : null;

  const targetTier = actResult?.applicationPriority?.find((t) => t.roleTier === "Target") ?? null;

  // ── Coach notes ─────────────────────────────────────────────────────────
  const coachResult: CoachResult | null =
    stage === "coach" && status === "completed" && notes
      ? (notes as unknown as CoachResult)
      : null;

  // ── Achieve notes ──────────────────────────────────────────────────────
  const achieveResult: AchieveResult | null =
    stage === "achieve" && status === "completed" && notes
      ? (notes as unknown as AchieveResult)
      : null;

    const readinessColor = coachResult?.interviewPrep
    ? coachResult.interviewPrep.estimatedReadinessScore >= 70 ? "text-green-700 bg-green-50"
      : coachResult.interviewPrep.estimatedReadinessScore >= 45 ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50"
    : "";

  const resumeScoreColor = coachResult?.resumeInsights
    ? coachResult.resumeInsights.score >= 70 ? "text-green-700 bg-green-50"
      : coachResult.resumeInsights.score >= 45 ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50"
    : "";

  return (
    <div
      className={
        "relative rounded-xl border p-5 transition-shadow " +
        config.bg + " " +
        (isCurrentStage ? "shadow-md ring-2 ring-brand-400 ring-offset-2" : "shadow-sm")
      }
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{config.icon}</span>
          <div>
            <h3 className={"font-semibold " + config.color}>{config.label}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{config.description}</p>
          </div>
        </div>
        <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + badge.class}>
          {badge.label}
        </span>
      </div>

      {/* ── Evaluate results ── */}
      {evalResult && (
        <div className="mt-4 space-y-2">
          <div className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold " + scoreColor}>
            <span>Market fit:</span>
            <span>{evalResult.marketFitScore}/100</span>
          </div>

          {evalResult.gaps.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Key gaps</p>
              <div className="flex flex-wrap gap-1.5">
                {evalResult.gaps.slice(0, 3).map((gap) => (
                  <span
                    key={gap}
                    className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5
                               text-xs font-medium text-red-700"
                  >
                    {gap}
                  </span>
                ))}
                {evalResult.gaps.length > 3 && (
                  <span className="text-xs text-gray-400">
                    +{evalResult.gaps.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {evalResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {evalResult.summary}
            </p>
          )}
        </div>
      )}

      {/* ── Advise results ── */}
      {adviceResult && topPath && (
        <div className="mt-4 space-y-2">
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Top recommended path</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-800 truncate">{topPath.title}</span>
              <span
                className={"shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold " + topPathScoreColor}
              >
                {topPath.matchScore}/100
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>~{adviceResult.timelineWeeks} weeks to role</span>
          </div>

          {topPath.gapSkills.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Skills to build</p>
              <div className="flex flex-wrap gap-1.5">
                {topPath.gapSkills.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5
                               text-xs font-medium text-amber-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {adviceResult.nextActions[0] && (
            <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Next action</p>
              <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                {adviceResult.nextActions[0]}
              </p>
            </div>
          )}

          {adviceResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {adviceResult.summary}
            </p>
          )}
        </div>
      )}

      {/* ── Learn results ── */}
      {learnResult && (
        <div className="mt-4 space-y-2">
          {/* Time commitment chips */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{learnResult.weeklyHoursNeeded}h / week</span>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>~{learnResult.estimatedCompletionWeeks} weeks</span>
            </div>
          </div>

          {/* Top skill gaps */}
          {learnResult.topSkillGaps.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Skills to close</p>
              <div className="flex flex-wrap gap-1.5">
                {learnResult.topSkillGaps.slice(0, 4).map((gap) => (
                  <span
                    key={gap}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5
                               text-xs font-medium text-violet-700"
                  >
                    {gap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top resources */}
          {topResources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">Top resources</p>
              {topResources.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg bg-white/60
                             border border-gray-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 line-clamp-1">{r.title}</p>
                    <p className="text-xs text-gray-500">{r.provider} · {r.estimatedHours}h</p>
                  </div>
                  <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs
                                   font-medium text-violet-700">
                    {RESOURCE_TYPE_LABEL[r.type] ?? r.type}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {learnResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {learnResult.summary}
            </p>
          )}
        </div>
      )}

      {/* ── Act results ── */}
      {actResult && (
        <div className="mt-4 space-y-2">
          {/* Weekly target chip */}
          <div className="flex items-center gap-1.5 rounded-lg bg-green-100 px-2.5 py-1
                          text-xs font-semibold text-green-700 w-fit">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>{actResult.weeklyApplicationTarget} applications / week</span>
          </div>

          {/* Top job search query */}
          {actResult.jobSearchQueries[0] && (
            <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Top search query</p>
              <p className="text-xs font-mono text-gray-700 leading-relaxed line-clamp-2">
                {actResult.jobSearchQueries[0]}
              </p>
            </div>
          )}

          {/* Target tier */}
          {targetTier && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Target roles</p>
              <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">{targetTier.description}</span>
                  <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                    {targetTier.targetCount} roles
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{targetTier.rationale}</p>
              </div>
            </div>
          )}

          {/* Top networking target */}
          {actResult.networkingTargets[0] && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Network first</p>
              <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2 space-y-0.5">
                <p className="text-xs font-semibold text-gray-800 line-clamp-1">
                  {actResult.networkingTargets[0].role} @ {actResult.networkingTargets[0].company}
                </p>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {actResult.networkingTargets[0].outreachTip}
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          {actResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {actResult.summary}
            </p>
          )}
        </div>
      )}

            {/* ── Coach results ── */}
      {coachResult && (
        <div className="mt-4 space-y-2">
          {/* Score chips row */}
          <div className="flex flex-wrap gap-2">
            {coachResult.interviewPrep && (
              <div className={"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold " + readinessColor}>
                <span>Interview readiness:</span>
                <span>{coachResult.interviewPrep.estimatedReadinessScore}/100</span>
              </div>
            )}
            {coachResult.resumeInsights && (
              <div className={"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold " + resumeScoreColor}>
                <span>Resume score:</span>
                <span>{coachResult.resumeInsights.score}/100</span>
              </div>
            )}
          </div>

          {/* Top practice question */}
          {coachResult.interviewPrep?.practiceQuestions[0] && (
            <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Practice question</p>
              <p className="text-xs text-gray-700 leading-relaxed line-clamp-2 italic">
                &ldquo;{coachResult.interviewPrep.practiceQuestions[0]}&rdquo;
              </p>
            </div>
          )}

          {/* Top resume suggestion */}
          {coachResult.resumeInsights?.suggestions[0] && (
            <div className="rounded-lg bg-white/60 border border-gray-200 px-3 py-2">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Resume: top fix</p>
              <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                {coachResult.resumeInsights.suggestions[0]}
              </p>
            </div>
          )}

          {/* Action items (top 3) */}
          {coachResult.actionItems.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Action items</p>
              <div className="space-y-1">
                {coachResult.actionItems.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-orange-500 text-xs">•</span>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {coachResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {coachResult.summary}
            </p>
          )}
        </div>
      )}

            {/* ── Achieve results ── */}
      {achieveResult && (
        <div className="mt-4 space-y-2">
          {/* Celebration message */}
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
            <p className="text-xs font-medium text-rose-700 mb-0.5">🎉 Cycle complete</p>
            <p className="text-xs text-rose-800 leading-relaxed line-clamp-3">
              {achieveResult.celebrationMessage}
            </p>
          </div>

          {/* Accomplishments */}
          {achieveResult.accomplishments.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">What you achieved</p>
              <div className="space-y-1">
                {achieveResult.accomplishments.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-rose-500 text-xs">✓</span>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top next-cycle recommendations */}
          {achieveResult.nextCycleRecommendations?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Next cycle focus</p>
              <div className="space-y-1">
                {achieveResult.nextCycleRecommendations
                  .filter((r) => r.priority === "high")
                  .slice(0, 2)
                  .map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 rounded-lg bg-white/60
                                            border border-gray-200 px-3 py-1.5">
                      <span className="shrink-0 mt-0.5 rounded bg-rose-100 px-1 py-0.5
                                       text-xs font-semibold text-rose-700">High</span>
                      <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">{r.focus}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {achieveResult.summary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {achieveResult.summary}
            </p>
          )}
        </div>
      )}

            {/* ── Run button (current stage) ── */}
      {isCurrentStage && onRun && (
        <button
          onClick={onRun}
          disabled={running}
          className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold
                     text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {running ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {"Running " + config.label + "..."}
            </span>
          ) : (
            "Run " + config.label
          )}
        </button>
      )}

      {/* ── Completed indicator (no notes) ── */}
      {status === "completed" && !evalResult && !adviceResult && !learnResult && !actResult && !coachResult && !achieveResult && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-green-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Stage complete
        </div>
      )}
    </div>
  );
}
