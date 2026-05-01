"use client";

/**
 * CoverLetterModal
 *
 * Modal triggered from OpportunityCard -- generates a tailored cover letter
 * via POST /api/cover-letter and lets the user copy or download it as a .txt file.
 */

import { useState, useCallback } from "react";
import { generateCoverLetter, type CoverLetterResult } from "@/services/ai/coverLetterService";

interface CoverLetterModalProps {
  opportunityId: string;
  opportunityTitle: string;
  companyName: string;
  cycleId?: string | null;
  onClose: () => void;
}

export function CoverLetterModal({
  opportunityId,
  opportunityTitle,
  companyName,
  cycleId,
  onClose,
}: CoverLetterModalProps) {
  const [result,    setResult]    = useState<CoverLetterResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateCoverLetter(opportunityId, cycleId ?? undefined);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate cover letter.");
    } finally {
      setLoading(false);
    }
  }, [opportunityId, cycleId]);

  const copyToClipboard = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard API
      const el = document.createElement("textarea");
      el.value = result.body;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const downloadAsTxt = useCallback(() => {
    if (!result) return;
    const filename = `cover-letter-${companyName.replace(/\s+/g, "-").toLowerCase()}.txt`;
    const content = `${result.subject}\n\n${result.body}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, companyName]);

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cover letter generator"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col
                      rounded-2xl bg-white shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">
              Cover Letter
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {opportunityTitle} · {companyName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-full p-1.5 text-gray-400
                       hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close cover letter generator"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Generate CTA — shown before generation */}
          {!result && !loading && (
            <div className="text-center py-8">
              <div className="mb-3 text-4xl">📄</div>
              <p className="text-sm text-gray-600 mb-6 max-w-sm mx-auto">
                Generate a tailored cover letter for{" "}
                <strong>{opportunityTitle}</strong> at{" "}
                <strong>{companyName}</strong>.
              </p>
              <button
                onClick={generate}
                className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold
                           text-white hover:bg-brand-700 transition-colors"
              >
                Generate Cover Letter
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                <span className="animate-spin text-lg">⏳</span>
                Writing your cover letter…
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={generate}
                className="mt-2 text-xs font-semibold text-red-600 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Cover letter output */}
          {result && (
            <>
              {/* Subject line */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Email Subject
                </p>
                <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2
                              text-sm text-gray-800 select-all">
                  {result.subject}
                </p>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Cover Letter
                  </p>
                  <span className="text-xs text-gray-400">
                    ~{result.word_count} words
                  </span>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 border border-gray-200
                                px-4 py-3 text-sm text-gray-800 leading-relaxed font-sans
                                max-h-72 overflow-y-auto select-all">
                  {result.body}
                </pre>
              </div>

              {/* Tips */}
              {result.tips.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">
                    💡 Personalisation tips
                  </p>
                  <ul className="space-y-1.5">
                    {result.tips.map((tip, i) => (
                      <li key={i} className="text-xs text-amber-800 flex gap-2">
                        <span className="shrink-0 text-amber-500">{i + 1}.</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {result && (
          <div className="flex items-center justify-between gap-3 px-6 py-4
                          border-t border-gray-100 bg-gray-50">
            <button
              onClick={generate}
              disabled={loading}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700
                         disabled:opacity-40 transition-colors"
            >
              ↺ Regenerate
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadAsTxt}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5
                           text-xs font-semibold text-gray-700 hover:bg-gray-100
                           transition-colors"
                aria-label="Download cover letter as text file"
              >
                ↓ Download .txt
              </button>
              <button
                onClick={copyToClipboard}
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5
                           text-xs font-semibold text-brand-700 hover:bg-brand-100
                           transition-colors"
                aria-label="Copy cover letter to clipboard"
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
