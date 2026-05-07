"use client";

/**
 * SkillsAssessment — 10-question confidence survey.
 *
 * Phase 4 Item 2b — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Renders as a modal launched from the Evaluate stage card. Top 10 skills
 * are pulled from the user's career_profiles.skills (passed in by parent).
 * On submit, POSTs to /api/career-os/evaluate/assessment which synthesizes
 * the report via Haiku 4.5 and stores both raw responses and the report
 * in career_os_stages.notes.assessment for the active cycle.
 *
 * Once notes has the assessment block, the strict completion rule from
 * Phase 1 kicks in and the Evaluate stage shows as `completed` on the
 * dashboard.
 */

import { useState } from "react";
import {
  submitSkillsAssessment,
  type SkillsAssessmentResponse,
  type SkillsAssessmentReport,
} from "@/services/ai/evaluateService";

const SCALE = [1, 2, 3, 4, 5] as const;
const SCALE_LABELS: Record<typeof SCALE[number], string> = {
  1: "No experience",
  2: "Beginner",
  3: "Working knowledge",
  4: "Confident",
  5: "Expert",
};

export interface SkillsAssessmentProps {
  cycleId:  string;
  /** The user's top 10 skills, derived from career_profiles.skills by parent. */
  skills:   string[];
  onClose:  () => void;
  onSaved?: (report: SkillsAssessmentReport) => void;
}

export function SkillsAssessment({ cycleId, skills, onClose, onSaved }: SkillsAssessmentProps) {
  // Pad to exactly 10 (or trim if more) — the route requires exactly 10.
  const skillList = skills.slice(0, 10);
  while (skillList.length < 10) skillList.push("(no skill — leave at 1)");

  const [responses, setResponses] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of skillList) init[s] = 3; // default confidence: working knowledge
    return init;
  });
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [report, setReport] = useState<SkillsAssessmentReport | null>(null);

  function setConfidence(skill: string, c: number) {
    setResponses(prev => ({ ...prev, [skill]: c }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: SkillsAssessmentResponse[] = skillList.map(s => ({
        skill:      s,
        confidence: (responses[s] ?? 3) as 1 | 2 | 3 | 4 | 5,
      }));
      const r = await submitSkillsAssessment(cycleId, payload);
      setReport(r);
      onSaved?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit assessment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skills-assessment-title"
      data-testid="skills-assessment-modal"
    >
      <div className="max-w-2xl w-full max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id="skills-assessment-title" className="text-base font-semibold text-gray-900">Skills self-assessment</h2>
            <p className="mt-1 text-xs text-gray-500">
              Rate your confidence in each skill. Honest ratings produce a more useful report.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {report ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" data-testid="skills-assessment-report">
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Strong</h3>
              <ul className="text-sm text-gray-700 list-disc pl-5">
                {report.strongSkills.length === 0
                  ? <li className="italic text-gray-400">none rated 4-5</li>
                  : report.strongSkills.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Developing</h3>
              <ul className="text-sm text-gray-700 list-disc pl-5">
                {report.developingSkills.length === 0
                  ? <li className="italic text-gray-400">none rated 2-3</li>
                  : report.developingSkills.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Gaps</h3>
              <ul className="text-sm text-gray-700 list-disc pl-5">
                {report.gapSkills.length === 0
                  ? <li className="italic text-gray-400">no gaps rated 1</li>
                  : report.gapSkills.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Narrative</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.narrative}</p>
            </section>
            <footer className="pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Done
              </button>
            </footer>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <ol className="space-y-3" data-testid="skills-assessment-questions">
              {skillList.map((skill, idx) => (
                <li key={idx} className="rounded-lg border border-gray-200 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-800 break-words">{idx + 1}. {skill}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SCALE.map(c => {
                      const selected = responses[skill] === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setConfidence(skill, c)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                          data-testid={`skill-${idx}-rating-${c}`}
                        >
                          {c} · {SCALE_LABELS[c]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="skills-assessment-error">
                {error}
              </div>
            )}

            <footer className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Synthesizing…" : "Submit"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
