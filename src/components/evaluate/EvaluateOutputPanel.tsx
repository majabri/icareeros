"use client";

/**
 * Sprint 5 Phase 1 (P1-2) — Renders the Evaluate stage's EvaluationResult.
 *
 * Layout: 2-column on desktop. Left = summary card (navy left border) +
 * market fit score ring + career level badge. Right = skills pills (teal)
 * and gaps pills (coral). LinkedIn analysis section below — gated when
 * `linkedinAnalysis.gated` is true.
 */

import type { EvaluationResult, LinkedInAnalysis, LinkedInGated } from "@/services/ai/evaluateService";
import { arr, str, num } from "@/lib/career-os/normalize";
import { useTargetSkills }  from "@/components/career-os/useTargetSkills";
import { useProfileSkills } from "@/components/career-os/useProfileSkills";
import { AddSkillPill } from "@/components/career-os/AddSkillPill";
import { useSyncSkillLists } from "@/components/career-os/useSyncSkillLists";

export interface EvaluateOutputPanelProps {
  result:      EvaluationResult;
  generatedAt?: string;
}

function isGated(x: EvaluationResult["linkedinAnalysis"]): x is LinkedInGated {
  return !!x && typeof x === "object" && "gated" in x && x.gated === true;
}

export function EvaluateOutputPanel({ result, generatedAt }: EvaluateOutputPanelProps) {
  // Sprint 5 hotfix (2026-05-15) — Each gap pill exposes TWO actions:
  // 🎯 add to target_skills (want to learn) and ✅ add to skills (have).
  // Independent state per skill, one-click each.
  const targetSkills  = useTargetSkills();
  // Sprint 5 hotfix (2026-05-15) — Adding to profile auto-removes from
  // target_skills (server-side); the onAdd callback keeps the target
  // hook's local state in sync.
  const profileSkills = useProfileSkills({ onAdd: targetSkills.remove });
  // Sprint 5 hotfix (2026-05-15) — One-shot cleanup of stale
  // overlap between target_skills and skills on page mount.
  useSyncSkillLists(targetSkills, profileSkills);

  // Sprint 5 hotfix (2026-05-16) — Defensive normalize. The shape of
  // `result` is whatever was last persisted to career_os_stages.notes
  // (could pre-date the current schema) or whatever Claude returned on
  // the most recent run. Treat every render-time access through these
  // safe accessors so a missing field never bricks the page.
  const safeResult = result as unknown as Record<string, unknown>;
  const skills              = arr<string>(safeResult.skills);
  const gaps                = arr<string>(safeResult.gaps);
  const summaryText         = str(safeResult.summary);
  const careerLevel         = str(safeResult.careerLevel, "—");
  const recommendedNextStage = str(safeResult.recommendedNextStage, "advise");
  const linkedinAnalysis     = (safeResult.linkedinAnalysis ?? null) as EvaluationResult["linkedinAnalysis"];

  const score = Math.max(0, Math.min(100, num(safeResult.marketFitScore)));
  const scoreColor =
    score >= 80 ? "text-emerald-600" :
    score >= 60 ? "text-brand-600"   :
    score >= 40 ? "text-amber-500"   :
                  "text-red-500";

  return (
    <div className="space-y-6">
      {/* Top: summary + market-fit + skills/gaps */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 border-l-4 border-l-brand-500">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Summary</h3>
            <p className="text-sm leading-relaxed text-gray-700">{summaryText}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Market fit</h3>
            <div className="flex items-baseline gap-3">
              <span className={`text-5xl font-black tabular-nums ${scoreColor}`}>{score}</span>
              <span className="text-sm font-medium text-gray-400">/100</span>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${score >= 60 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                {careerLevel}
              </span>
              <span className="text-xs text-gray-500">
                Recommended next: <strong className="text-gray-700">{recommendedNextStage}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Skills you have <span className="ml-1 text-xs text-gray-400">({skills.length})</span>
            </h3>
            {skills.length === 0 ? (
              <p className="text-sm text-gray-400">No skills detected yet — add some to your profile.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span key={s} className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800">{s}</span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Skill gaps <span className="ml-1 text-xs text-gray-400">({gaps.length})</span>
            </h3>
            {gaps.length === 0 ? (
              <p className="text-sm text-gray-400">No critical gaps identified for your target.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {gaps.map((g) => (
                    <AddSkillPill
                      key={g}
                      skill={g}
                      targetSkills={targetSkills}
                      profileSkills={profileSkills}
                      variant="gap"
                    />
                  ))}
                </div>
                {(targetSkills.error || profileSkills.error) && (
                  <p className="mt-2 text-xs text-red-600">{targetSkills.error ?? profileSkills.error}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* LinkedIn analysis */}
      {linkedinAnalysis && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">LinkedIn analysis</h3>
            {isGated(linkedinAnalysis) && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Upgrade</span>
            )}
          </div>
          {isGated(linkedinAnalysis) ? (
            <p className="text-sm text-gray-600">
              {(linkedinAnalysis as LinkedInGated).upgradeMessage}{" "}
              <a href="/settings/billing" className="text-brand-700 underline">Upgrade plans</a>
            </p>
          ) : (
            <EvaluateLinkedIn analysis={linkedinAnalysis as LinkedInAnalysis} />
          )}
        </div>
      )}

      {/* Generated-at timestamp */}
      {generatedAt && (
        <p className="text-xs text-gray-400">
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function EvaluateLinkedIn({ analysis }: { analysis: LinkedInAnalysis }) {
  // Sprint 5 hotfix (2026-05-16) — same defensive pattern as the parent.
  const safeAnalysis     = analysis as unknown as Record<string, unknown>;
  const strengthScore    = num(safeAnalysis.strengthScore);
  const headlineSuggest  = str(safeAnalysis.headlineSuggestion);
  const aboutGaps        = arr<string>(safeAnalysis.aboutGaps);
  const skillsToAdd      = arr<string>(safeAnalysis.skillsToAdd);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Strength</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-brand-700">{strengthScore}</span>
          <span className="text-xs text-gray-400">/ 10</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Suggested headline</p>
        <p className="rounded-md bg-gray-50 px-3 py-2 text-gray-800">"{headlineSuggest}"</p>
      </div>
      {aboutGaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">About-section gaps</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700">
            {aboutGaps.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}
      {skillsToAdd.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Skills to add</p>
          <div className="flex flex-wrap gap-1.5">
            {skillsToAdd.map((s) => (
              <span key={s} className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
