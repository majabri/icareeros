"use client";

import { useState } from "react";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { generateLearningPlan, type LearnResult, type LearningResource } from "@/services/ai/learnService";
import { useTargetSkills } from "@/components/career-os/useTargetSkills";

interface StoredLearn extends LearnResult {
  generatedAt?: string;
}

const TYPE_ICON: Record<LearningResource["type"], string> = {
  course:        "📚",
  certification: "🎓",
  book:          "📖",
  video:         "🎬",
  article:       "📰",
  mentorship:    "🤝",
};

export function LearnPageInner() {
  const { loading, userId, cycle, output, reload, setOutput } = useStageData<StoredLearn>("learn");
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      const result = await generateLearningPlan(userId, cycle.id);
      setOutput({ ...result, generatedAt: new Date().toISOString() });
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Learn failed. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <StagePageScaffold
      title="Learning Plan"
      subtitle="Top resources for your gaps"
      stageLabel="Learn"
      outputNoun="Learning plan"
      loading={loading}
      noCycle={!loading && !cycle}
      hasOutput={!!output}
      error={error}
      running={running}
      cycleInfo={cycle ? { cycleNumber: cycle.cycle_number, goal: cycle.goal } : null}
      onRun={handleRun}
    >
      {output && <LearnOutputPanel result={output} />}
    </StagePageScaffold>
  );
}

function LearnOutputPanel({ result }: { result: StoredLearn }) {
  const sorted    = [...result.resources].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  const [expanded, setExpanded] = useState(false);
  const visible   = expanded ? sorted : sorted.slice(0, 6);

  // Sprint 5 hotfix (2026-05-15) — Resource cards + the top-of-page banner
  // push skills onto career_profiles.target_skills via this hook.
  const targetSkills = useTargetSkills();
  const [addingAll,  setAddingAll]  = useState(false);
  const [addAllNote, setAddAllNote] = useState<string | null>(null);

  async function handleAddAllTopGaps() {
    if (result.topSkillGaps.length === 0 || addingAll) return;
    setAddingAll(true);
    setAddAllNote(null);
    const { added } = await targetSkills.add(result.topSkillGaps);
    setAddingAll(false);
    setAddAllNote(
      added.length > 0
        ? `Added ${added.length} skill${added.length === 1 ? "" : "s"} to your profile.`
        : "All top gaps already on your target list."
    );
    window.setTimeout(() => setAddAllNote(null), 3500);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-l-4 border-l-brand-500">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-sm leading-relaxed text-gray-700 flex-1 min-w-[200px]">{result.summary}</p>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-2xl font-bold tabular-nums text-brand-700">{result.weeklyHoursNeeded}</div>
              <div className="text-xs text-gray-500">hrs / week</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-brand-700">{result.estimatedCompletionWeeks}</div>
              <div className="text-xs text-gray-500">weeks total</div>
            </div>
          </div>
        </div>
        {result.topSkillGaps.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Top skill gaps</p>
            <div className="flex flex-wrap gap-1.5">
              {result.topSkillGaps.map((s) => {
                const already = targetSkills.has(s);
                return (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${already ? "bg-teal-100 text-teal-800" : "bg-red-100 text-red-700"}`}
                  >
                    {already && <span aria-hidden>✓</span>}
                    {s}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleAddAllTopGaps()}
                disabled={addingAll || targetSkills.loading}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {addingAll ? "Adding…" : "Add all skill gaps →"}
              </button>
              {addAllNote && <span className="text-xs text-emerald-700">{addAllNote}</span>}
              {targetSkills.error && <span className="text-xs text-red-600">{targetSkills.error}</span>}
            </div>
          </div>
        )}
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Recommended resources <span className="ml-1 text-xs text-gray-400">({sorted.length})</span>
          </h3>
          {sorted.length > 6 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-brand-700 underline"
            >
              {expanded ? "Show top 6" : `Show all ${sorted.length}`}
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((r, i) => <ResourceCard key={`${r.title}-${i}`} r={r} targetSkills={targetSkills} />)}
        </div>
      </section>
    </div>
  );
}

function ResourceCard({
  r,
  targetSkills,
}: {
  r: LearningResource;
  targetSkills: ReturnType<typeof useTargetSkills>;
}) {
  const TitleEl = r.url ? "a" : "div";
  const titleProps = r.url ? { href: r.url, target: "_blank", rel: "noopener noreferrer" } : {};
  const score = Math.max(0, Math.min(100, r.priorityScore ?? 0));

  // Sprint 5 hotfix (2026-05-15) — Add-skills CTA pushes this card's
  // skillsCovered onto career_profiles.target_skills. Disabled (and shows
  // "Skills added ✓") when every skillsCovered entry is already on the
  // user's target list.
  const allAlreadyAdded =
    r.skillsCovered.length > 0 && r.skillsCovered.every((s) => targetSkills.has(s));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleAddSkills() {
    if (r.skillsCovered.length === 0 || busy || allAlreadyAdded) return;
    setBusy(true);
    setNote(null);
    const { added } = await targetSkills.add(r.skillsCovered);
    setBusy(false);
    if (added.length > 0) {
      setNote(`Added ${added.length} skill${added.length === 1 ? "" : "s"}.`);
    } else {
      setNote("Already on your target list.");
    }
    window.setTimeout(() => setNote(null), 2800);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden>{TYPE_ICON[r.type] ?? "📚"}</span>
        <div className="flex-1 min-w-0">
          <TitleEl {...titleProps} className={`block text-sm font-semibold text-gray-900 ${r.url ? "hover:text-brand-700 hover:underline" : ""}`}>
            {r.title}
          </TitleEl>
          <p className="text-xs text-gray-500 mt-0.5">
            {r.provider} · {r.estimatedHours} hrs
          </p>
          {r.skillsCovered.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.skillsCovered.slice(0, 4).map((s) => {
                const already = targetSkills.has(s);
                return (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${already ? "bg-emerald-100 text-emerald-800" : "bg-teal-100 text-teal-800"}`}
                  >
                    {already && <span aria-hidden>✓</span>}
                    {s}
                  </span>
                );
              })}
              {r.skillsCovered.length > 4 && (
                <span className="text-[10px] text-gray-500 self-center">+{r.skillsCovered.length - 4}</span>
              )}
            </div>
          )}
          <div className="mt-2 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="h-1 rounded-full bg-brand-500" style={{ width: `${score}%` }} />
          </div>
          {r.skillsCovered.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleAddSkills()}
                disabled={busy || allAlreadyAdded || targetSkills.loading}
                className={`text-[11px] font-semibold ${allAlreadyAdded ? "text-emerald-700" : "text-brand-700 hover:underline"} disabled:opacity-60`}
              >
                {allAlreadyAdded
                  ? "Skills added ✓"
                  : busy
                    ? "Adding…"
                    : "Add skills to profile →"}
              </button>
              {note && <span className="text-[10px] text-gray-500">{note}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

