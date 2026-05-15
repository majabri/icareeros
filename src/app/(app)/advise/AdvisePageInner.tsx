"use client";

import Link from "next/link";
import { useState } from "react";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { generateAdvice, type AdviceResult, type CareerPath } from "@/services/ai/adviseService";

interface StoredAdvice extends AdviceResult {
  generatedAt?: string;
}

export function AdvisePageInner() {
  const { loading, userId, cycle, output, reload } = useStageData<StoredAdvice>("advise");
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      await generateAdvice(userId, cycle.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Advise failed. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <StagePageScaffold
      title="Career Advice"
      subtitle="Recommended paths + next actions"
      stageLabel="Advise"
      loading={loading}
      noCycle={!loading && !cycle}
      hasOutput={!!output}
      error={error}
      running={running}
      onRun={handleRun}
    >
      {output && <AdviceOutputPanel result={output} />}
    </StagePageScaffold>
  );
}

function AdviceOutputPanel({ result }: { result: StoredAdvice }) {
  const top4 = result.recommendedPaths.slice(0, 4);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-l-4 border-l-brand-500">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <p className="text-sm leading-relaxed text-gray-700 flex-1 min-w-[200px]">{result.summary}</p>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-brand-700">~{result.timelineWeeks}</div>
            <div className="text-xs text-gray-500">weeks to job-ready</div>
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Recommended paths</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {top4.map((p) => <CareerPathCard key={p.title} path={p} />)}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Next actions</h3>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
          {result.nextActions.map((a, i) => <li key={i}>{a}</li>)}
        </ol>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <Link href="/learn" className="text-sm text-brand-700 underline">
            Build a learning plan to close these gaps →
          </Link>
        </div>
      </section>
    </div>
  );
}

function CareerPathCard({ path }: { path: CareerPath }) {
  const score = Math.max(0, Math.min(100, path.matchScore));
  const barColor = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-base font-semibold text-gray-900">{path.title}</h4>
        <span className="text-sm font-bold tabular-nums text-brand-700">{score}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-500">~{path.estimatedWeeks} weeks · {path.requiredSkills.length} skills needed</p>
      {path.requiredSkills.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Required skills</p>
          <div className="flex flex-wrap gap-1">
            {path.requiredSkills.slice(0, 6).map((s) => (
              <span key={s} className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">{s}</span>
            ))}
          </div>
        </div>
      )}
      {path.gapSkills.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Gaps</p>
          <div className="flex flex-wrap gap-1">
            {path.gapSkills.slice(0, 6).map((s) => (
              <span key={s} className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
