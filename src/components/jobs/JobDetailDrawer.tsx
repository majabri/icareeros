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
 * URL sync (handled by parent /jobs page):
 *   - Opening: pushes ?job=<id> to the URL — shareable, back-button-safe.
 *   - Closing: replaces back to /jobs.
 *
 * Critical rules from the brief:
 *   - 'Apply at {Company} →' is the ONLY external link in this component.
 *   - Never show aggregator name in the Apply button — derive from
 *     opp.company, or disable when no chased company URL exists.
 *   - All other actions (Analyze fit, Cover Letter, Outreach, Track)
 *     work within the drawer without leaving the platform.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { writeIncomingTrack } from "@/components/applications/pipelineFilters";
import { OutreachCard } from "./OutreachCard";
import { CoverLetterModal } from "./CoverLetterModal";
import { SalaryBadge } from "./SalaryBadge";
import { DeepFitPanel } from "./DeepFitPanel";
import type { DeepFitResult } from "@/lib/jobFitAnalysis";
import { ApplyConfirmModal } from "./ApplyConfirmModal";
import { PipelineSavedToast } from "./PipelineSavedToast";
import { resolveApplyTarget } from "@/services/jobs/applyHelpers";

export interface JobDetailDrawerProps {
  job: OpportunityResult | null;
  onClose: () => void;
  cycleId?: string | null;
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, cur: string | null | undefined): string | null {
  if (!min && !max) return null;
  const c = (cur ?? "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : `${c} `;
  const fmt = (n: number) => `${sym}${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

export function JobDetailDrawer({ job, onClose, cycleId }: JobDetailDrawerProps) {
  const router = useRouter();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Internal modal state for Cover Letter / Outreach. The drawer is
  // self-contained: it doesn't depend on the parent to open these.
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showOutreach,    setShowOutreach]    = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "warning" } | null>(null);
  // Sprint 2 W1 — Deep Fit Pro feature
  const [deepFit,            setDeepFit]            = useState<DeepFitResult | null>(null);
  const [deepFitLoading,     setDeepFitLoading]     = useState(false);
  const [deepFitError,       setDeepFitError]       = useState<string | null>(null);
  const [showUpgradeModal,   setShowUpgradeModal]   = useState(false);

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

  // Reset modal state when job changes (closing/switching drawer).
  useEffect(() => {
    setShowCoverLetter(false);
    setShowOutreach(false);
    setDeepFit(null);
    setDeepFitError(null);
    setShowUpgradeModal(false);
  }, [job?.id]);

  if (!job) return null;

  const salary      = formatSalary(job.salary_min ?? null, job.salary_max ?? null, job.salary_currency ?? null);
  const applyUrl    = job.apply_url_company || null;
  const companyName = job.company || "this company";

  // Truncate description to ~300 words to keep the drawer scannable.
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

  async function handleDeepFit(opts?: { refresh?: boolean }) {
    if (!job?.id) return;
    setDeepFitLoading(true);
    setDeepFitError(null);
    try {
      const res = await fetch("/api/jobs/deep-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, refresh: opts?.refresh === true }),
      });
      if (res.status === 403) {
        setShowUpgradeModal(true);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDeepFitError(j?.message ?? j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      if (j?.result) setDeepFit(j.result as DeepFitResult);
    } catch (e) {
      setDeepFitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setDeepFitLoading(false);
    }
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
      {/* Scrim — closes on click. z-[80] sits above AppTopBar (z-40)
          and the sidebar (z-30) so nothing leaks through the overlay. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm md:bg-black/30"
      />

      {/* Drawer panel — z-[81] above the scrim. Uses CSS variable tokens
          so dark mode picks up the JBS palette automatically. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        style={{ backgroundColor: "var(--surface-card, #ffffff)", color: "var(--text-primary, #111827)" }}
        className="fixed inset-y-0 right-0 z-[81] flex w-full flex-col shadow-2xl
                   md:w-[58%] md:max-w-3xl
                   animate-in slide-in-from-right duration-200"
      >
        {/* Header — back + close. shrink-0 so it never collapses. */}
        <header
          style={{ borderColor: "var(--surface-border, #e5e7eb)", backgroundColor: "var(--surface-card, #ffffff)" }}
          className="flex items-center justify-between border-b px-4 py-3 shrink-0"
        >
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            style={{ color: "var(--text-primary, #374151)" }}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium hover:opacity-80 transition-opacity"
            aria-label="Back to results"
          >
            <span aria-hidden="true">←</span>
            <span>Back to results</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ color: "var(--text-muted, #6b7280)" }}
            className="rounded-lg p-1.5 hover:opacity-80 transition-opacity"
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
              <h1
                id="job-drawer-title"
                style={{ color: "var(--text-primary, #111827)" }}
                className="text-xl font-bold leading-snug"
              >
                {job.title}
              </h1>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {typeof job.fit_score === "number" && (
                  <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/30">
                    {job.fit_score}% match
                  </span>
                )}
                {typeof job.responseProbability === "number" && job.responseProbability > 0 && (
                  <span className="rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-semibold">
                    Response {job.responseProbability}%
                  </span>
                )}
                {typeof job.decisionScore === "number" && job.decisionScore > 0 && (
                  <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold">
                    Decision {job.decisionScore}/100
                  </span>
                )}
              </div>
            </div>
            <p style={{ color: "var(--text-primary, #374151)" }} className="text-sm font-medium">{companyName}</p>
            <div style={{ color: "var(--text-muted, #6b7280)" }} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {job.location && <span>📍 {job.location}</span>}
              {job.type && <span>💼 {job.type}</span>}
              {job.is_remote && <span>🏠 Remote</span>}
              {salary && <span className="font-semibold" style={{ color: "var(--text-primary, #111827)" }}>💰 {salary}</span>}
              {salary && <SalaryBadge salary={salary} title={job.title} />}
            </div>
            {job.match_summary && (
              <p
                style={{
                  color: "var(--text-muted, #4b5563)",
                  backgroundColor: "var(--surface-muted, #f9fafb)",
                  borderColor: "var(--surface-border, #e5e7eb)",
                }}
                className="text-xs italic rounded-lg px-3 py-2 border"
              >
                {job.match_summary}
              </p>
            )}
          </div>

          {/* In-drawer action buttons — never leave the platform */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAnalyzeFit}
              style={{
                borderColor: "var(--surface-border, #e5e7eb)",
                backgroundColor: "var(--surface-card, #ffffff)",
                color: "var(--text-primary, #374151)",
              }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-80 transition-opacity"
            >
              🎯 Analyze fit
            </button>
            {/* Sprint 2 W1 — Deep Fit (Pro-tier) */}
            <button
              type="button"
              onClick={() => handleDeepFit()}
              disabled={deepFitLoading}
              style={{
                borderColor: "var(--surface-border, #e5e7eb)",
                backgroundColor: "var(--surface-card, #ffffff)",
                color: "var(--text-primary, #374151)",
              }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity"
              aria-label="Run deep fit analysis"
            >
              {deepFitLoading ? "🔬 Analyzing…" : "🔬 Deep Fit"}
            </button>
            {job.id && (
              <button
                type="button"
                onClick={() => setShowCoverLetter(true)}
                style={{
                  borderColor: "var(--surface-border, #e5e7eb)",
                  backgroundColor: "var(--surface-card, #ffffff)",
                  color: "var(--text-primary, #374151)",
                }}
                className="rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                📄 Cover Letter
              </button>
            )}
            {job.id && (
              <button
                type="button"
                onClick={() => setShowOutreach(true)}
                style={{
                  borderColor: "var(--surface-border, #e5e7eb)",
                  backgroundColor: "var(--surface-card, #ffffff)",
                  color: "var(--text-primary, #374151)",
                }}
                className="rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                ✉ Outreach
              </button>
            )}
            <button
              type="button"
              onClick={handleTrack}
              style={{
                borderColor: "var(--surface-border, #e5e7eb)",
                backgroundColor: "var(--surface-card, #ffffff)",
                color: "var(--text-primary, #374151)",
              }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-80 transition-opacity"
            >
              📋 Track
            </button>
          </div>

          {/* About the role */}
          {truncatedDesc && (
            <section className="space-y-2">
              <h2 style={{ color: "var(--text-muted, #6b7280)" }} className="text-sm font-semibold uppercase tracking-wide">About this role</h2>
              <div style={{ color: "var(--text-primary, #374151)" }} className="whitespace-pre-wrap text-sm leading-relaxed">
                {truncatedDesc}
              </div>
            </section>
          )}

          {/* Sprint 2 W1 — Deep Fit panel (rendered when result loaded) */}
          {deepFit && (
            <DeepFitPanel
              result={deepFit}
              onRefresh={() => handleDeepFit({ refresh: true })}
            />
          )}
          {deepFitError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              Deep Fit failed: {deepFitError}
            </div>
          )}

                    {/* Quality flags surface (if any) */}
          {Array.isArray(job.flag_reasons) && job.flag_reasons.length > 0 && (
            <section className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-400">
              <strong className="font-semibold">Note:</strong>{" "}
              {job.flag_reasons.join(", ")}
            </section>
          )}
        </div>

        {/* Sticky Apply CTA — Wave 3.5 tracked apply.
            Button is NEVER disabled. Clicking opens the confirmation
            modal, which auto-saves to Pipeline + opens the apply URL
            (direct company URL or Google fallback). */}
        <footer
          style={{ borderColor: "var(--surface-border, #e5e7eb)", backgroundColor: "var(--surface-card, #ffffff)" }}
          className="border-t px-6 py-4 shrink-0"
        >
          <button
            type="button"
            onClick={() => setShowApplyConfirm(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-black hover:bg-cyan-400 transition-colors w-full"
          >
            {resolveApplyTarget(job).label}
          </button>
          {!applyUrl && (
            <p style={{ color: "var(--text-muted, #9ca3af)" }} className="mt-1 text-[11px] text-center">
              No direct link — we&apos;ll search Google for the company&apos;s application page.
            </p>
          )}
        </footer>
      </aside>

      {/* Internal modals — rendered at top z-index so they overlay the drawer */}
      {showOutreach && job.id && (
        <OutreachCard
          opportunityId={job.id}
          opportunityTitle={job.title}
          companyName={job.company}
          cycleId={cycleId}
          onClose={() => setShowOutreach(false)}
        />
      )}
      {/* Sprint 2 W1 — Deep Fit upgrade modal */}
      {showUpgradeModal && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setShowUpgradeModal(false)}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deep-fit-upgrade-title"
            style={{
              backgroundColor: "var(--surface-card, #ffffff)",
              color:           "var(--text-primary, #0f172a)",
              borderColor:     "var(--surface-border, #e5e7eb)",
            }}
            className="fixed left-1/2 top-1/2 z-[91] -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md rounded-2xl border shadow-2xl p-6 space-y-4"
          >
            <header className="space-y-1">
              <h2 id="deep-fit-upgrade-title" className="text-lg font-semibold">
                🔬 Deep Fit Analysis is a Standard feature
              </h2>
              <p style={{ color: "var(--text-muted, #6b7280)" }} className="text-sm">
                Upgrade to see matched skills, gaps, and interview probability for this role.
              </p>
            </header>
            <div className="flex flex-col gap-2 pt-2">
              <a
                href="/settings/billing"
                className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400 transition-colors text-center"
              >
                See plans
              </a>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                style={{ color: "var(--text-muted, #6b7280)" }}
                className="w-full rounded-xl px-4 py-2 text-xs hover:underline"
              >
                Maybe later
              </button>
            </div>
          </div>
        </>
      )}

            {showCoverLetter && job.id && (
        <CoverLetterModal
          opportunityId={job.id}
          opportunityTitle={job.title}
          companyName={job.company}
          cycleId={cycleId}
          onClose={() => setShowCoverLetter(false)}
        />
      )}

      {/* Apply confirmation + Pipeline-saved toast (Wave 3.5) */}
      {showApplyConfirm && (
        <ApplyConfirmModal
          opportunity={job}
          target={resolveApplyTarget(job)}
          onClose={() => setShowApplyConfirm(false)}
          onCoverLetter={() => setShowCoverLetter(true)}
          onApplied={(saved) => setToast({
            message: saved ? "Saved to your Pipeline" : "Opened apply link (couldn't save to Pipeline)",
            variant: saved ? "success" : "warning",
          })}
        />
      )}
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
