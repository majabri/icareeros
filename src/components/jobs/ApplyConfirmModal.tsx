"use client";

/**
 * ApplyConfirmModal — Wave 3.5 tracked-apply flow.
 *
 * Behaviour (per COWORK-BRIEF-jobs-experience-v1 §Wave 3.5):
 *   - Direct mode (apply_url_company present):
 *       Title: "Ready to apply?"  (was "Ready to apply at <Company>?")
 *       Subtitle: destination hostname
 *       Two actions: [Generate cover letter first] [Apply now]
 *   - Research mode (no chased URL):
 *       Title: "We'll open a Google search to find the company's page."
 *       Subtitle: the search query
 *       Two actions: [Open Cover Letter first] [Find & Apply]
 *
 * In both modes, clicking the primary action:
 *   1. auto-saves a Pipeline row (status='applying' or 'researching')
 *   2. opens the apply URL in a new tab
 *   3. shows an inline toast "Saved to your Pipeline" (or a softer
 *      message when the save failed — the URL still opens).
 *
 * The "Generate cover letter first" action triggers the parent-supplied
 * `onCoverLetter` callback (drawer manages the modal there) and closes
 * this confirm.
 */

import { useState } from "react";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { autoSaveApplication, type ApplyTarget } from "@/services/jobs/applyHelpers";

interface ApplyConfirmModalProps {
  opportunity: OpportunityResult;
  target:      ApplyTarget;
  onClose:     () => void;
  /** Called when user picks "Generate cover letter first". */
  onCoverLetter?: () => void;
  /**
   * Called once the auto-save attempt has resolved. The caller can
   * surface a toast or refresh /applications counts. Receives whether
   * the save succeeded so the toast can differentiate.
   */
  onApplied?: (saved: boolean) => void;
}

export function ApplyConfirmModal({ opportunity, target, onClose, onCoverLetter, onApplied }: ApplyConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const companyName = opportunity.company || "this company";
  const direct = target.mode === "direct";

  async function handleApplyNow() {
    setSubmitting(true);
    // Auto-save first (fast — completes before the new tab even loads).
    const result = await autoSaveApplication(opportunity, target);
    // Open the apply URL in a new tab no matter what — never block on tracking.
    if (typeof window !== "undefined") {
      window.open(target.url, "_blank", "noopener,noreferrer");
    }
    onApplied?.(result.ok);
    setSubmitting(false);
    onClose();
  }

  function handleCoverLetterFirst() {
    onCoverLetter?.();
    onClose();
  }

  return (
    <>
      {/* Scrim — z-90 so it sits above the drawer (z-81) but below tier-app modals. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-confirm-title"
        style={{
          backgroundColor: "var(--surface-card, #ffffff)",
          color:           "var(--text-primary, #0f172a)",
          borderColor:     "var(--surface-border, #e5e7eb)",
        }}
        className="fixed left-1/2 top-1/2 z-[91] -translate-x-1/2 -translate-y-1/2
                   w-[92vw] max-w-md rounded-2xl border shadow-2xl
                   p-6 space-y-4"
      >
        <header className="space-y-1">
          <h2 id="apply-confirm-title" className="text-lg font-semibold">
            {direct
              ? "Ready to apply?"
              : `Let's find the application for ${companyName}`}
          </h2>
          <p style={{ color: "var(--text-muted, #6b7280)" }} className="text-sm">
            {direct
              ? <>We&apos;ll save this to your Pipeline as <strong>Applying</strong> and open the application page in a new tab.</>
              : <>No direct link is attached to this listing. We&apos;ll open a Google search to help you find the company&apos;s application page and save this to your Pipeline as <strong>Researching</strong>.</>}
          </p>
          {target.hostname && (
            <p style={{ color: "var(--text-muted, #6b7280)" }} className="text-xs">
              Destination: <span className="font-medium">{target.hostname}</span>
            </p>
          )}
        </header>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleApplyNow}
            disabled={submitting}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60 transition-colors"
          >
            {submitting
              ? "Saving…"
              : direct ? "✈ Apply" : "🔎 Find & Apply on Google"}
          </button>
          {onCoverLetter && opportunity.id && (
            <button
              type="button"
              onClick={handleCoverLetterFirst}
              disabled={submitting}
              style={{
                borderColor: "var(--surface-border, #e5e7eb)",
                color:       "var(--text-primary, #374151)",
              }}
              className="w-full rounded-xl border px-4 py-3 text-sm font-semibold hover:opacity-80 disabled:opacity-60 transition-opacity"
            >
              📄 Generate cover letter first
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ color: "var(--text-muted, #6b7280)" }}
            className="w-full rounded-xl px-4 py-2 text-xs hover:underline disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
