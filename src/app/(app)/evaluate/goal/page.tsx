/**
 * /evaluate/goal — Career Goal Fit (Evaluate stage)
 *
 * Strategic counterpart to /evaluate/job-fit. Compares the user's profile
 * against their stated TARGET ROLE(S) — not against a specific job posting.
 *
 * Answers: "Am I on track to become a Senior Product Manager?"
 *
 * Sister surface to /evaluate/job-fit ("Should I apply to THIS Senior PM
 * role at Acme?").
 *
 * Filed 2026-05-26 alongside the /fit-check + /resumeadvisor consolidation.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { STAGE_COLORS } from "@/lib/career-os/stage-colors";

interface TargetRoleAnalysis {
  title:             string;
  fitScore:          number;
  readinessLevel:    "early" | "developing" | "ready" | "competitive";
  strengths:         string[];
  gaps:              string[];
  next3Actions:      string[];
  suggestedLearning: string[];
}

interface GoalFitResult {
  overall_summary: string;
  target_roles:    TargetRoleAnalysis[];
  empty?:          boolean;
}

const TEAL  = STAGE_COLORS.evaluate;
const CORAL = STAGE_COLORS.advise;
const GOLD  = STAGE_COLORS.learn;
const GREEN = STAGE_COLORS.act;

function readinessColor(level: TargetRoleAnalysis["readinessLevel"]): string {
  switch (level) {
    case "competitive": return GREEN;
    case "ready":       return GREEN;
    case "developing":  return GOLD;
    default:            return CORAL;
  }
}

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 70 ? GREEN : score >= 40 ? GOLD : CORAL;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={6} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fontSize={size * 0.28} fontWeight={700} fill={color}>{score}</text>
    </svg>
  );
}

export default function CareerGoalFitPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<GoalFitResult | null>(null);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/career-os/evaluate/goal-fit", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: GoalFitResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run goal-fit analysis.");
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void runAnalysis(); }, [runAnalysis]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider"
             style={{ color: TEAL }}>Evaluate</p>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Career Goal Fit</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            How close is your current profile to the role(s) you&apos;re aiming for?
            Strategic, long-horizon. For tactical &ldquo;should I apply to this specific job&rdquo;
            analysis, use <Link href="/evaluate/job-fit" className="underline hover:text-gray-900">Job Application Fit</Link>.
          </p>
        </div>
        <Link
          href="/mycareer/preferences"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit target roles →
        </Link>
      </header>

      {loading && !error && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Reading your target roles and analysing your profile…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Could not run the analysis.</strong> {error}
          <button onClick={() => void runAnalysis()}
                  className="ml-2 underline hover:text-red-900"
                  disabled={running}>Retry</button>
        </div>
      )}

      {!loading && result?.empty && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-amber-900">No target role set</h2>
          <p className="mt-1 text-sm text-amber-800">{result.overall_summary}</p>
          <Link
            href="/mycareer/preferences"
            className="mt-3 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            Set a target role
          </Link>
        </div>
      )}

      {!loading && result && !result.empty && (
        <>
          <section className="mb-6 rounded-md border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Overall readiness</h2>
            <p className="mt-1 text-sm text-gray-700">{result.overall_summary}</p>
          </section>

          <section className="grid gap-5 sm:grid-cols-1 lg:grid-cols-2">
            {result.target_roles.map((r) => (
              <article key={r.title}
                       className="rounded-lg border border-gray-200 bg-white p-5"
                       style={{ borderLeftWidth: 4, borderLeftColor: readinessColor(r.readinessLevel) }}>
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{r.title}</h3>
                    <p className="mt-0.5 text-xs uppercase tracking-wide"
                       style={{ color: readinessColor(r.readinessLevel) }}>
                      {r.readinessLevel}
                    </p>
                  </div>
                  <ScoreRing score={r.fitScore} size={80} />
                </header>

                {r.strengths.length > 0 && (
                  <section className="mt-4">
                    <h4 className="text-xs font-semibold text-gray-700">Strengths</h4>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                      {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </section>
                )}

                {r.gaps.length > 0 && (
                  <section className="mt-3">
                    <h4 className="text-xs font-semibold text-gray-700">Gaps</h4>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                      {r.gaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </section>
                )}

                {r.next3Actions.length > 0 && (
                  <section className="mt-3">
                    <h4 className="text-xs font-semibold text-gray-700">Next 3 actions</h4>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-gray-700">
                      {r.next3Actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ol>
                  </section>
                )}

                {r.suggestedLearning.length > 0 && (
                  <section className="mt-3 rounded-md bg-amber-50 p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-amber-900">Suggested learning</h4>
                      <Link href="/targetskills"
                            className="text-xs font-medium text-amber-700 underline hover:text-amber-900">
                        Add to Target Skills →
                      </Link>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {r.suggestedLearning.map((l, i) => (
                        <li key={i} className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-300">
                          {l}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </article>
            ))}
          </section>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Analysis is point-in-time. Re-run after updating your profile or target roles.
            </p>
            <button
              onClick={() => void runAnalysis()}
              disabled={running}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {running ? "Re-running…" : "Re-run analysis"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
