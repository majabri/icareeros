"use client";

import { useState } from "react";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { generateLearningPlan, type LearnResult, type LearningResource } from "@/services/ai/learnService";

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
  const { loading, userId, cycle, output, reload } = useStageData<StoredLearn>("learn");
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      await generateLearningPlan(userId, cycle.id);
      await reload();
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
      loading={loading}
      noCycle={!loading && !cycle}
      hasOutput={!!output}
      error={error}
      running={running}
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
              {result.topSkillGaps.map((s) => (
                <span key={s} className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">{s}</span>
              ))}
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
          {visible.map((r, i) => <ResourceCard key={`${r.title}-${i}`} r={r} />)}
        </div>
      </section>
    </div>
  );
}

function ResourceCard({ r }: { r: LearningResource }) {
  const TitleEl = r.url ? "a" : "div";
  const titleProps = r.url ? { href: r.url, target: "_blank", rel: "noopener noreferrer" } : {};
  const score = Math.max(0, Math.min(100, r.priorityScore ?? 0));
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
              {r.skillsCovered.slice(0, 4).map((s) => (
                <span key={s} className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">{s}</span>
              ))}
            </div>
          )}
          <div className="mt-2 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="h-1 rounded-full bg-brand-500" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

