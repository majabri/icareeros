"use client";

/**
 * OutreachCard
 *
 * Modal triggered from OpportunityCard — generates personalised LinkedIn and
 * email outreach messages via POST /api/outreach and lets the user copy them.
 */

import { useState, useCallback } from "react";
import { generateOutreach, type OutreachResult } from "@/services/ai/outreachService";

interface OutreachCardProps {
  opportunityId: string;
  opportunityTitle: string;
  companyName: string;
  cycleId?: string | null;
  onClose: () => void;
}

type Platform = "linkedin" | "email";

export function OutreachCard({
  opportunityId,
  opportunityTitle,
  companyName,
  cycleId,
  onClose,
}: OutreachCardProps) {
  const [result,    setResult]    = useState<OutreachResult | null>(null);
  const [platform,  setPlatform]  = useState<Platform>("linkedin");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateOutreach(opportunityId, cycleId ?? undefined);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate outreach message.");
    } finally {
      setLoading(false);
    }
  }, [opportunityId, cycleId]);

  const copyToClipboard = useCallback(async () => {
    if (!result) return;
    const msg = result[platform].message;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard
      const el = document.createElement("textarea");
      el.value = msg;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result, platform]);

  const active = result ? result[platform] : null;

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Outreach message generator"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Outreach Generator</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {opportunityTitle} · {companyName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* Not yet generated */}
          {!result && !loading && !error && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">
                Generate a personalised outreach message for this role, ready to copy and send.
              </p>
              <button
                onClick={generate}
                className="mt-4 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white
                           shadow-sm hover:bg-blue-700 transition-colors"
              >
                Generate message
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <p className="text-sm text-gray-500">Writing your outreach…</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                onClick={generate}
                className="ml-3 font-medium underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="space-y-4">

              {/* Platform toggle */}
              <div className="flex rounded-lg border border-gray-200 p-1">
                {(["linkedin", "email"] as Platform[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors
                      ${platform === p
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {p === "linkedin" ? "LinkedIn note" : "Email"}
                  </button>
                ))}
              </div>

              {/* Subject (email only) */}
              {platform === "email" && active?.subject && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</p>
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">{active.subject}</p>
                </div>
              )}

              {/* Message */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Message</p>
                  {platform === "linkedin" && (
                    <span className="text-xs text-gray-400">
                      {active?.message.length ?? 0}/300 chars
                    </span>
                  )}
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2.5 text-sm
                                text-gray-800 font-sans leading-relaxed min-h-[80px]">
                  {active?.message}
                </pre>
              </div>

              {/* Tips */}
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Tips</p>
                <ul className="space-y-1.5">
                  {result.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center
                                       rounded-full bg-blue-100 text-blue-600 font-semibold">
                        {i + 1}
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Copy button */}
              <button
                onClick={copyToClipboard}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors
                  ${copied
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
              >
                {copied ? "✓ Copied!" : "Copy message"}
              </button>

              {/* Regenerate */}
              <button
                onClick={generate}
                className="w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-500
                           hover:bg-gray-50 transition-colors"
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
