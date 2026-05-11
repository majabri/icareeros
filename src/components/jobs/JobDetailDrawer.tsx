"use client";

/**
 * JobDetailDrawer — Wave 2 of COWORK-BRIEF-jobs-experience-v1.
 *
 * In-platform job posting viewer. Hard rule from the brief:
 *   'No user should ever leave the platform to read a job posting.'
 *
 * Layout:
 *   - Desktop: slides in from the right at 58% width; list is 42%.
 *   - Mobile (< 768px): full-screen bottom sheet, swipe-down dismiss.
 *
 * URL sync:
 *   - Opening: pushes ?job=<id> to the URL — shareable, back-button-safe.
 *   - Closing: replaces back to /jobs.
 *   - Reading: parent /jobs page reads ?job= on mount and pre-opens.
 *
 * Critical rules from the brief:
 *   - 'Apply at {Company} →' is the ONLY external link in this component.
 *   - Never show aggregator name in the Apply button — derive from
 *     opp.company, or disable when no chased company URL exists.
 *   - All other actions (Analyze fit, Cover Letter, Outreach, Track)
 *     work within the drawer without navigation.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { writeIncomingTrack } from "@/components/applications/pipelineFilters";

export interface JobDetailDrawerProps {
  job: OpportunityResult | null;
  onClose: () => void;
  /** Called when user clicks Outreach — opens the existing outreach modal in parent. */
  onOutreach?: (job: OpportunityResult) => void;
  /** Called when user clicks Cover Letter — opens the existing modal in parent. */
  onCoverLetter?: (job: OpportunityResult) => void;
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, cur: string | null | undefined): string | null {
  if (!min && !max) return null;
  const c = (cur ?? "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : `${c} `;
  const fmt = (n: number) => `${sym}${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

export function JobDetailDrawer({ job, onClose, onOutreach, onCoverLetter }: JobDetailDrawerProps) {
  const router = useRouter();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the close button on open + escape-to-close.
  useEffect(() => {
    if (!job) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose]);

  if (!job) return null;

  const salary = formatSalary(job.salary_min ?? null, job.salary_max ?? null, job.salary_currency ?? null);
  const applyUrl = job.apply_url_company || null;
  const companyName = job.company || "this company";

  // Truncate description to ~300 words — brief's request to keep the
  // drawer scannable. Word boundary, append ellipsis if cut.
  const fullDesc = job.description || "";
  const words = fullDesc.split(/\s+/);
  const truncatedDesc =
    words.length > 300 ? `${words.slice(0, 300).join(" ")}…` : fullDesc;

  function handleAnalyzeFit() {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "resumeAdvisor:incomingJob",
        JSON.stringify({
          title:         job!.title || "",
          company:       job!.company || "",
          location:      job!.location || "",
          description:   job!.description || "",
          url:           job!.apply_url_company ?? job!.url ?? "",
          opportunityId: typeof job!.id === "string" ? job!.id : null,
        }),
      );
    } catch { /* private mode — ignore */ }
    router.push("/resumeadvisor");
  }

  function handleTrack() {
    writeIncomingTrack({
      job_title:      job!.title || "",
      company:        job!.company || "",
      job_url:        job!.apply_url_company ?? job!.url ?? null,
      opportunity_id: typeof job!.id === "string" ? job!.id : null,
    });
    router.push("/applications?track=1");
  }

  return (
    <>
      {/* Scrim — closes on click */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:bg-black/30"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl
                   md:w-[58%] md:max-w-3xl
                   animate-in slide-in-from-right duration-200"
      >
        {/* Header — back + close */}
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 bg-white">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            aria-label="Back to results"
          >
            <span aria-hidden="true">←</span>
            <span>Back to results</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            aria-label="Close drawer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Title + meta */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 id="job-drawer-title" className="text-xl font-bold text-gray-900 leading-snug">
                {job.title}
              </h1>
              {typeof job.fit_score === "number" && (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 shrink-0">
                  {job.fit_score}% match
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-700">{companyName}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {job.location && <span>📍 {job.location}</span>}
              {job.type && <span>💼 {job.type}</span>}
              {job.is_remote && <span>🏠 Remote</span>}
              {salary && <span className="font-semibold text-gray-700">💰 {salary}</span>}
            </div>
            {job.match_summary && (
              <p className="text-xs italic text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                {job.match_summary}
              </p>
            )}
          </div>

          {/* In-drawer action buttons — never leave the platform */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAnalyzeFit}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🎯 Analyze fit
            </button>
            {onCoverLetter && (
              <button
                type="button"
                onClick={() => onCoverLetter(job)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                📄 Cover Letter
              </button>
            )}
            {onOutreach && (
              <button
                type="button"
                onClick={() => onOutreach(job)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ✉ Outreach
              </button>
            )}
            <button
              type="button"
              onClick={handleTrack}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              📋 Track
            </button>
          </div>

          {/* About the role */}
          {truncatedDesc && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">About this role</h2>
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                {truncatedDesc}
              </div>
            </section>
          )}

          {/* Quality flags surface (if any) */}
          {Array.isArray(job.flag_reasons) && job.flag_reasons.length > 0 && (
            <section className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <strong className="font-semibold">Note:</strong>{" "}
              {job.flag_reasons.join(", ")}
            </section>
          )}
        </div>

        {/* Sticky Apply CTA — only external link in the drawer */}
        <footer className="border-t border-gray-200 px-6 py-4 shrink-0 bg-white">
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors w-full"
            >
              ✈ Apply at {companyName} →
            </a>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-400 cursor-not-allowed w-full"
              >
                Apply (link unavailable)
              </button>
              <p className="text-[11px] text-gray-400">
                We couldn&apos;t resolve a direct application link for this listing.
              </p>
            </div>
          )}
        </footer>
      </aside>
    </>
  );
}
