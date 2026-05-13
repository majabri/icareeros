"use client";

/**
 * DeepFitPanel — Pro-tier deep analysis result panel for the JobDetailDrawer.
 *
 * Renders the DeepFitResult shape from `/api/jobs/deep-fit` as:
 *   • Score ring (XX% fit)
 *   • Interview probability (XX% interview chance)
 *   • Matched skills (green chips)
 *   • Missing skills (red chips with severity)
 *   • Top 3 improvement actions
 *
 * Inline-loaded inside the drawer body; not a modal.
 */

import type { DeepFitResult } from "@/lib/jobFitAnalysis";

interface DeepFitPanelProps {
  result: DeepFitResult;
  /** Called when the user clicks "Re-analyze" to bust the cache. */
  onRefresh?: () => void;
}

function ScoreRing({ percent, label, sublabel }: { percent: number; label: string; sublabel: string }) {
  const r = 30, c = 2 * Math.PI * r;
  const dash = Math.min(100, Math.max(0, percent)) / 100 * c;
  const colorVar =
    percent >= 75 ? "var(--text-primary, #10b981)" :
    percent >= 50 ? "var(--text-primary, #f59e0b)" :
                    "var(--text-primary, #ef4444)";
  const ringStroke =
    percent >= 75 ? "#10b981" :
    percent >= 50 ? "#f59e0b" :
                    "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle
          cx="38" cy="38" r={r} fill="none" stroke={ringStroke} strokeWidth="6"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={colorVar}>
          {percent}%
        </text>
      </svg>
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{sublabel}</div>
      </div>
    </div>
  );
}

function MatchedChip({ skill }: { skill: string }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium
                     bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
      ✓ {skill}
    </span>
  );
}

const SEVERITY_STYLES = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30",
  moderate: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  minor:    "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border border-zinc-500/30",
};

function MissingChip({ skill, severity }: { skill: string; severity: "critical" | "moderate" | "minor" }) {
  const sev = severity === "critical" ? "Critical" : severity === "moderate" ? "Moderate" : "Minor";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[severity]}`}>
      ✗ {skill} <span className="opacity-70">· {sev}</span>
    </span>
  );
}

export function DeepFitPanel({ result, onRefresh }: DeepFitPanelProps) {
  const matched = result.matchedSkills.filter(s => s.matched);
  const missing = result.matchedSkills.filter(s => !s.matched).slice(0, 8);

  // Top 3 improvement actions come from the first 3 plan entries.
  const top3Actions = result.improvementPlan.slice(0, 3);

  return (
    <section
      style={{
        borderColor:     "var(--surface-border, #e5e7eb)",
        backgroundColor: "var(--surface-muted, #f9fafb)",
      }}
      className="rounded-xl border p-4 space-y-4"
      aria-label="Deep fit analysis"
    >
      {/* Header: title + (optional) refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          🔬 Deep Fit Analysis
        </h3>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="text-[11px] underline opacity-70 hover:opacity-100"
            style={{ color: "var(--text-muted)" }}
          >
            Re-analyze
          </button>
        )}
      </div>

      {/* Score rings row */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreRing
          percent={result.overallScore}
          label="Overall fit"
          sublabel={`${result.keywordAlignment}% keyword match`}
        />
        <ScoreRing
          percent={result.interviewProbability}
          label="Interview chance"
          sublabel={`${result.experienceMatch}% level match`}
        />
      </div>

      {/* AI-readable summary */}
      <p className="text-xs leading-relaxed italic" style={{ color: "var(--text-muted)" }}>
        {result.summary}
      </p>

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Strengths
          </div>
          <div className="flex flex-wrap gap-1.5">
            {matched.slice(0, 12).map(s => <MatchedChip key={s.skill} skill={s.skill} />)}
          </div>
        </div>
      )}

      {/* Gaps */}
      {missing.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Gaps
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((s, i) => (
              <MissingChip
                key={s.skill}
                skill={s.skill}
                severity={i < 2 ? "critical" : i < 5 ? "moderate" : "minor"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top 3 improvement actions */}
      {top3Actions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Top actions
          </div>
          <ol className="space-y-1.5 pl-1">
            {top3Actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                <span className="font-semibold opacity-70 shrink-0">{a.week}</span>
                <span>{a.action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="text-[10px] uppercase tracking-wider opacity-60" style={{ color: "var(--text-muted)" }}>
        Detected role level: {result.jobLevel}
      </div>
    </section>
  );
}
