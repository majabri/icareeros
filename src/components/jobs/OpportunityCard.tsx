"use client";

import { useState } from "react";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { OutreachCard } from "./OutreachCard";
import { CoverLetterModal } from "./CoverLetterModal";

interface OpportunityCardProps {
  opportunity: OpportunityResult;
  cycleId?: string | null;
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

export function OpportunityCard({ opportunity: opp, cycleId }: OpportunityCardProps) {
  const [showOutreach,     setShowOutreach]     = useState(false);
  const [showCoverLetter,  setShowCoverLetter]  = useState(false);
  const fit    = fitLabel(opp.fit_score);
  const salary = formatSalary(opp.salary_min ?? null, opp.salary_max ?? null, opp.salary_currency ?? null, opp.salary ?? null);

  return (
    <>
      <div className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm
                      transition-shadow hover:shadow-md">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={opp.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-semibold text-gray-900 hover:text-brand-600 transition-colors"
            >
              {opp.title}
            </a>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {opp.company}
              {opp.location ? ` · ${opp.location}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${fit.color}`}>
            {fit.label}
          </span>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5">
          {opp.type && (
            <Tag>{opp.type}</Tag>
          )}
          {opp.is_remote && <Tag color="sky">Remote</Tag>}
          {salary && <Tag color="green">{salary}</Tag>}
          {opp.source && (
            <Tag color="gray">{opp.source}</Tag>
          )}
        </div>

        {/* Description snippet */}
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
            {opp.url && (
              <a
                href={opp.apply_url_company ?? opp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white
                           hover:bg-brand-700 transition-colors"
              >
                {opp.apply_url_company ? "Apply on company site →" : "Apply →"}
              </a>
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
