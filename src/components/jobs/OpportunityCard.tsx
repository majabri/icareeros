"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { OutreachCard } from "./OutreachCard";
import { writeIncomingTrack } from "@/components/applications/pipelineFilters";
import { CoverLetterModal } from "./CoverLetterModal";
import { SalaryBadge } from "./SalaryBadge";
import { ApplyConfirmModal } from "./ApplyConfirmModal";
import { PipelineSavedToast } from "./PipelineSavedToast";
import { resolveApplyTarget } from "@/services/jobs/applyHelpers";

/**
 * Brief Task 10 — fire-and-forget POST to record a per-job action signal
 * for the aggregator's feedback boost. Never blocks the UI; silently swallows.
 *
 * Maps:
 *   tracked|saved|applied  -> positive boost (+10 fit)
 *   dismissed              -> negative penalty (-15 fit)
 */
function recordFeedback(opp: OpportunityResult, action: "saved" | "applied" | "tracked" | "dismissed") {
  try {
    void fetch("/api/opportunities/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        job_url: opp.apply_url_company ?? opp.url ?? null,
        company: opp.company ?? null,
        source:  opp.source ?? null,
      }),
    }).catch(() => {});
  } catch { /* best-effort */ }
}

interface OpportunityCardProps {
  opportunity: OpportunityResult;
  cycleId?: string | null;
  /**
   * Wave 2 — opens the in-platform Job Detail Drawer in the parent page.
   * When provided, the card title and "View details" button trigger this
   * instead of navigating to an external URL. Hard rule from
   * COWORK-BRIEF-jobs-experience-v1: users never leave the platform to
   * read a posting — only the Apply button goes external.
   */
  onSelect?: (opp: OpportunityResult) => void;
  /** feat/jobs-smart-apply — when set, the Apply button opens the parent's
   *  SmartApplyPanel instead of the legacy confirm-and-launch modal. */
  onSmartApply?: (opp: OpportunityResult) => void;
}

// fix/jobs-multi-target-roles Requirement B — prominent, color-coded score.
// Renders for every card, including 0 (never null when userProfile present).
const FIT_COLORS: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-gray-100 text-gray-500",
};

function fitLabel(score: number | null | undefined): { label: string; color: string } | null {
  if (score === null || score === undefined) return null;
  if (score >= 75) return { label: `${score}% match`, color: FIT_COLORS.high };
  if (score >= 50) return { label: `${score}% match`, color: FIT_COLORS.medium };
  return { label: `${score}% match`, color: FIT_COLORS.low };
}

// Requirement B — color-coded ranges for the prominent numeric badge.
// ≥80 teal · 60-79 gold · 40-59 coral · <40 slate
function fitBadgeColor(score: number): string {
  if (score >= 80) return "#00B8A9"; // brand teal
  if (score >= 60) return "#F5A623"; // gold
  if (score >= 40) return "#FF6B6B"; // coral
  return "#7B9AC0";                  // slate blue
}

// Requirement B — 3px progress bar for the breakdown strip
function FitBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[10px] text-gray-500 w-14 text-right leading-none">{label}</div>
      <div className="flex-1 h-[3px] bg-gray-100 rounded overflow-hidden">
        <div className="h-full bg-brand-500" style={{ width: `${v}%` }} />
      </div>
      <div className="text-[10px] text-gray-600 w-6 text-right tabular-nums leading-none">{v}</div>
    </div>
  );
}

function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  salaryStr?: string | null
): string | null {
  if (salaryStr) return salaryStr;
  if (!min && !max) return null;
  const sym = currency === "USD" || !currency ? "$" : currency + " ";
  const fmt = (n: number) =>
    n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return `Up to ${fmt(max!)}`;
}

export function OpportunityCard({ opportunity: opp, cycleId, onSelect, onSmartApply }: OpportunityCardProps) {
  const router = useRouter();
  const [showOutreach,     setShowOutreach]     = useState(false);
  const [showCoverLetter,  setShowCoverLetter]  = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "warning" } | null>(null);

  function handleAnalyzeFit() {
    if (typeof window === "undefined") return;
    try {
      const payload = {
        title:         opp.title || "",
        company:       opp.company || "",
        location:      opp.location || "",
        description:   opp.description || "",
        url:           opp.apply_url_company ?? opp.url ?? "",
        opportunityId: typeof opp.id === "string" ? opp.id : null,
      };
      sessionStorage.setItem("resumeAdvisor:incomingJob", JSON.stringify(payload));
    } catch { /* private-mode storage failure — page still works, just no prefill */ }
    router.push("/evaluate/job-fit");
  }

  function handleTailorResume() {
    if (typeof window === "undefined") return;
    // fix/jobs-ux-feedback Fix 6 — pre-populate /resume/generate with
    // the job data via sessionStorage, then navigate.
    try {
      sessionStorage.setItem("tailorResume:incomingJob", JSON.stringify({
        title:       opp.title       || "",
        company:     opp.company     || "",
        description: opp.description || "",
      }));
    } catch { /* private-mode failure — non-fatal */ }
    router.push("/resume/generate?from=job-card");
  }

  function handleTrack() {
    if (typeof window === "undefined") return;
    writeIncomingTrack({
      job_title:      opp.title || "",
      company:        opp.company || "",
      job_url:        opp.apply_url_company ?? opp.url ?? null,
      opportunity_id: typeof opp.id === "string" ? opp.id : null,
    });
    recordFeedback(opp, "tracked");
    router.push("/applications?track=1");
  }

  function handleSelect() {
    if (onSelect) onSelect(opp);
  }

  const fit         = fitLabel(opp.fit_score);
  const salary      = formatSalary(opp.salary_min ?? null, opp.salary_max ?? null, opp.salary_currency ?? null, opp.salary ?? null);
  const chasedUrl   = opp.apply_url_company || null;
  const companyName = opp.company || "this company";

  return (
    <>
      <div className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm
                      transition-shadow hover:shadow-md">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {onSelect ? (
              <button
                type="button"
                onClick={handleSelect}
                className="block w-full text-left truncate font-semibold text-gray-900 hover:text-brand-600 transition-colors"
                aria-label={`View details for ${opp.title} at ${opp.company}`}
              >
                {opp.title}
              </button>
            ) : (
              <span className="block truncate font-semibold text-gray-900">{opp.title}</span>
            )}
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {opp.company}
              {opp.location ? ` · ${opp.location}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {/* Requirement B — prominent numeric fit-score badge with hover expand */}
            {typeof opp.fit_score === "number" && (
              <div
                className="group/fit relative flex flex-col items-end gap-1"
                title={
                  opp.fit_breakdown?.targetRoleBestMatch
                    ? `Best target-role match: ${opp.fit_breakdown.targetRoleBestMatch}`
                    : undefined
                }
              >
                <div
                  className="text-2xl font-bold leading-none"
                  style={{ color: fitBadgeColor(opp.fit_score) }}
                  aria-label={`Fit score ${opp.fit_score} out of 100`}
                >
                  {opp.fit_score}%
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500 -mt-0.5">Fit Score</div>
                {opp.fit_breakdown && (
                  <div className="w-32 space-y-1 mt-1">
                    <FitBar label="Role"     value={opp.fit_breakdown.targetRole} />
                    <FitBar label="Skills"   value={opp.fit_breakdown.skills} />
                    <FitBar label="Seniority" value={opp.fit_breakdown.seniority} />
                    {/* Expand-on-hover: full breakdown */}
                    <div className="hidden group-hover/fit:block pt-1 mt-1 border-t border-gray-100 space-y-1">
                      {typeof opp.fit_breakdown.experience === "number" && (
                        <FitBar label="Experience" value={opp.fit_breakdown.experience} />
                      )}
                      {typeof opp.fit_breakdown.keywords === "number" && (
                        <FitBar label="Keywords" value={opp.fit_breakdown.keywords} />
                      )}
                      {opp.fit_breakdown.targetRoleBestMatch && (
                        <div className="text-[10px] text-gray-500 leading-tight">
                          Best match: <span className="text-gray-700 font-medium">{opp.fit_breakdown.targetRoleBestMatch}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Fallback text pill retained when we have no numeric fit_score (guest / no profile) */}
            {typeof opp.fit_score !== "number" && fit && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fit.color}`}>
                {fit.label}
              </span>
            )}
            {typeof opp.responseProbability === "number" && opp.responseProbability > 0 && (
              <span className="rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold">
                Response {opp.responseProbability}%
              </span>
            )}
            {typeof opp.decisionScore === "number" && opp.decisionScore > 0 && (
              <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">
                Decision {opp.decisionScore}/100
              </span>
            )}
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5">
          {opp.type && <Tag>{opp.type}</Tag>}
          {opp.is_remote && <Tag color="sky">Remote</Tag>}
          {salary && <Tag color="green">{salary}</Tag>}
          {salary && <SalaryBadge salary={salary} title={opp.title} />}
          {/*
            Source tag is intentionally hidden. Aggregator names
            (Adzuna, Indeed, etc.) are plumbing and must never reach
            the user per COWORK-BRIEF-jobs-experience-v1.
          */}
        </div>

        {/* Description snippet — clamped to 2 lines; full description lives in the drawer */}
        {opp.description && (
          <p className="line-clamp-2 text-xs text-gray-500 leading-relaxed">
            {opp.description}
          </p>
        )}

        {/* Match summary */}
        {opp.match_summary && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 italic">
            {opp.match_summary}
          </p>
        )}

        {/* Footer: smart tag + action buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {opp.smart_tag || opp.smartTag ? (
            <span className="text-xs font-medium text-amber-600">
              ⚡ {opp.smart_tag ?? opp.smartTag}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {/* View details — opens in-platform drawer (Wave 2) */}
            {onSelect && (
              <button
                type="button"
                onClick={handleSelect}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs
                           font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label={`View details for ${opp.title}`}
              >
                View details
              </button>
            )}
            {/* Analyze fit — hand off this JD to Resume Advisor */}
            <button
              onClick={handleAnalyzeFit}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs
                         font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              aria-label={`Analyze fit between your profile and ${opp.title} at ${opp.company}`}
              title="Send this job description to Resume Advisor for a full fit analysis"
            >
              🎯 Analyze fit
            </button>
            {/* fix/jobs-ux-feedback Fix 6 — direct link to /resume/generate
                pre-populated with this job. */}
            <button
              onClick={handleTailorResume}
              className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs
                         font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              aria-label={`Tailor your resume for ${opp.title} at ${opp.company}`}
              title="Open Tailor Resume with this job pre-loaded"
            >
              📝 Tailor Resume
            </button>
            {/* Cover Letter button — only show if opportunity has an id */}
            {opp.id && (
              <button
                onClick={() => setShowCoverLetter(true)}
                className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs
                           font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
                aria-label={`Generate cover letter for ${opp.title} at ${opp.company}`}
              >
                📄 Cover Letter
              </button>
            )}
            {/* Outreach button — only show if opportunity has an id */}
            {opp.id && (
              <button
                onClick={() => setShowOutreach(true)}
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs
                           font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
                aria-label={`Generate outreach message for ${opp.title} at ${opp.company}`}
              >
                ✉ Outreach
              </button>
            )}
            <button
              onClick={handleTrack}
              data-testid="opportunity-track-btn"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs
                         font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label={`Track ${opp.title} at ${opp.company} as an application`}
            >
              📋 Track
            </button>
            {/* Apply button (Wave 2 hard rule):
                - Only show external link when we have apply_url_company
                  (a CHASED, company-direct or ATS URL). Aggregator URLs
                  (opp.url from Adzuna et al.) are NEVER used here.
                - Label always shows the company name — never the
                  aggregator's name.
                - When no chased URL: disabled "Apply (link unavailable)". */}
            {/* Wave 3.5 — tracked apply.
                Button is NEVER disabled. We always show an actionable
                path: direct apply when we have a chased company URL;
                "Find & Apply" Google search otherwise. The modal
                handles the confirm + auto-save to Pipeline. */}
            <button
              type="button"
              onClick={() => onSmartApply ? onSmartApply(opp) : setShowApplyConfirm(true)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              title={onSmartApply ? "Open Smart Apply" : (chasedUrl ? `Apply at ${companyName}` : `Find ${companyName}'s application via Google`)}
            >
              {onSmartApply ? "⚡ Smart Apply" : resolveApplyTarget(opp).label}
            </button>
          </div>
        </div>
      </div>

      {/* Outreach modal */}
      {showOutreach && opp.id && (
        <OutreachCard
          opportunityId={opp.id}
          opportunityTitle={opp.title}
          companyName={opp.company}
          cycleId={cycleId}
          onClose={() => setShowOutreach(false)}
        />
      )}

      {/* Cover Letter modal */}
      {showCoverLetter && opp.id && (
        <CoverLetterModal
          opportunityId={opp.id}
          opportunityTitle={opp.title}
          companyName={opp.company}
          cycleId={cycleId}
          onClose={() => setShowCoverLetter(false)}
        />
      )}

      {/* Apply confirmation modal */}
      {showApplyConfirm && (
        <ApplyConfirmModal
          opportunity={opp}
          target={resolveApplyTarget(opp)}
          onClose={() => setShowApplyConfirm(false)}
          onCoverLetter={() => setShowCoverLetter(true)}
          onApplied={(saved) => {
            recordFeedback(opp, saved ? "saved" : "applied");
            setToast({
              message: saved ? "Saved to your Pipeline" : "Opened apply link (couldn't save to Pipeline)",
              variant: saved ? "success" : "warning",
            });
          }}
        />
      )}

      {/* Auto-dismissing Pipeline-saved toast */}
      {toast && (
        <PipelineSavedToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

// ── Internal tag chip ─────────────────────────────────────────────────────────

const TAG_COLORS = {
  default: "bg-gray-100 text-gray-600",
  sky:     "bg-sky-100 text-sky-700",
  green:   "bg-green-100 text-green-700",
  gray:    "bg-gray-100 text-gray-500",
};

function Tag({
  children,
  color = "default",
}: {
  children: React.ReactNode;
  color?: keyof typeof TAG_COLORS;
}) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_COLORS[color]}`}>
      {children}
    </span>
  );
}
