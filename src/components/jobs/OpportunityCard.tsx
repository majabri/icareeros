"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { OutreachCard } from "./OutreachCard";
import { writeIncomingTrack } from "@/components/applications/pipelineFilters";
import { CoverLetterModal } from "./CoverLetterModal";
import { SalaryBadge } from "./SalaryBadge";

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
}

const FIT_COLORS: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-gray-100 text-gray-500",
};

function fitLabel(score: number | null | undefined): { label: string; color: string } {
  if (!score) return { label: "No score", color: FIT_COLORS.low };
  if (score >= 75) return { label: `${score}% match`, color: FIT_COLORS.high };
  if (score >= 50) return { label: `${score}% match`, color: FIT_COLORS.medium };
  return { label: `${score}% match`, color: FIT_COLORS.low };
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

export function OpportunityCard({ opportunity: opp, cycleId, onSelect }: OpportunityCardProps) {
  const router = useRouter();
  const [showOutreach,     setShowOutreach]     = useState(false);
  const [showCoverLetter,  setShowCoverLetter]  = useState(false);

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
    router.push("/resumeadvisor");
  }

  function handleTrack() {
    if (typeof window === "undefined") return;
    writeIncomingTrack({
      job_title:      opp.title || "",
      company:        opp.company || "",
      job_url:        opp.apply_url_company ?? opp.url ?? null,
      opportunity_id: typeof opp.id === "string" ? opp.id : null,
    });
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
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fit.color}`}>
              {fit.label}
            </span>
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
            {chasedUrl ? (
              <a
                href={chasedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                title={`Apply at ${companyName}`}
              >
                ✈ Apply at {companyName} →
              </a>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Direct application link unavailable — open the listing for more options."
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed"
              >
                Apply (link unavailable)
              </button>
            )}
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
