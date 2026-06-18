"use client";

import Link from "next/link";
import { useState } from "react";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { useAutorunStage } from "@/components/career-os/useAutorunStage";
import { triggerAction, type ActResult, type ApplicationTier, type NetworkingTarget } from "@/services/ai/actService";
import { arr, str, num } from "@/lib/career-os/normalize";

const HUB_LINKS: Array<{ href: string; label: string; description: string; icon: string }> = [
  { href: "/opportunities",         label: "Opportunities", description: "Search + score open jobs.",          icon: "💼" },
  { href: "/pipeline", label: "Pipeline",      description: "Track your active applications.",   icon: "📋" },
  { href: "/interview",    label: "Interview",     description: "Mock interviews + question bank.",  icon: "🎤" },
  { href: "/offers",       label: "Offer Desk",    description: "Compare and negotiate offers.",     icon: "🤝" },
];

const TIER_COLOR: Record<ApplicationTier["roleTier"], string> = {
  Stretch: "bg-purple-100 text-purple-800",
  Target:  "bg-teal-100 text-teal-800",
  Safety:  "bg-emerald-100 text-emerald-800",
};

export function ActPageInner() {
  const { loading, userId, cycle, output, reload, setOutput } = useStageData<ActResult>("act");
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      const result = await triggerAction(userId, cycle.id);
      setOutput(result);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Act failed. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

    // autorun-v2 (2026-05-17) — fire handleRun() automatically
  // when the user lands here via the dashboard's Run deep-link
  // (`?autorun=1`). Guards against re-runs when output exists.
  useAutorunStage({
    ready:     !loading && !!cycle && !!userId,
    hasOutput: !!output,
    running,
    onRun:     handleRun,
  });

  return (
    <StagePageScaffold
      title="Action Plan"
      subtitle="Job-search + networking plan"
      stageLabel="Act"
      outputNoun="Action plan"
      loading={loading}
      noCycle={!loading && !cycle}
      hasOutput={!!output}
      error={error}
      running={running}
      cycleInfo={cycle ? { cycleNumber: cycle.cycle_number, goal: cycle.goal } : null}
      cycleId={cycle?.id ?? null}
      userId={userId}
      onRun={handleRun}
    >
      {output && <ActOutputPanel result={output} />}
      {/* Hub links always visible (even pre-run) so the user can jump into the tools */}
      <HubLinks />
    </StagePageScaffold>
  );
}

function ActOutputPanel({ result }: { result: ActResult }) {
  const safeResult              = result as unknown as Record<string, unknown>;
  const summaryText             = str(safeResult.summary);
  const weeklyApplicationTarget = num(safeResult.weeklyApplicationTarget);
  const jobSearchQueries        = arr<string>(safeResult.jobSearchQueries);
  const applicationPriority     = arr<ApplicationTier>(safeResult.applicationPriority);
  const networkingTargets       = arr<NetworkingTarget>(safeResult.networkingTargets);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-l-4 border-l-brand-500">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-sm leading-relaxed text-gray-700 flex-1 min-w-[200px]">{summaryText}</p>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-brand-700">{weeklyApplicationTarget}</div>
            <div className="text-xs text-gray-500">apps / week</div>
          </div>
        </div>
      </div>

      {jobSearchQueries.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Search queries to run</h3>
          <div className="flex flex-wrap gap-2">
            {jobSearchQueries.map((q) => (
              <Link key={q} href={`/jobs?q=${encodeURIComponent(q)}`} className="rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800 hover:bg-teal-200">
                {q}
              </Link>
            ))}
          </div>
        </section>
      )}

      {applicationPriority.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Application mix</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {applicationPriority.map((t, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TIER_COLOR[t.roleTier]}`}>
                    {t.roleTier}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-gray-900">{t.targetCount}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-800">{t.description}</p>
                <p className="mt-1 text-xs text-gray-500">{t.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {networkingTargets.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Networking targets</h3>
          <ul className="space-y-3">
            {networkingTargets.map((t, i) => <NetworkingRow key={i} t={t} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function NetworkingRow({ t }: { t: NetworkingTarget }) {
  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <p className="text-sm font-semibold text-gray-900">{t.role} <span className="font-normal text-gray-500">@ {t.company}</span></p>
      <p className="mt-1 text-xs text-gray-600">{t.rationale}</p>
      <p className="mt-2 text-xs text-brand-700"><strong>Outreach tip:</strong> {t.outreachTip}</p>
    </li>
  );
}

function HubLinks() {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Tools for this stage</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HUB_LINKS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
          >
            <div className="text-2xl" aria-hidden>{h.icon}</div>
            <p className="mt-2 text-sm font-semibold text-gray-900 group-hover:text-brand-700">{h.label}</p>
            <p className="text-xs text-gray-500">{h.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
