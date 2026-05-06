"use client";

/**
 * CoachBriefPanel — "Get my coaching brief" button + inline brief renderer.
 *
 * Calls POST /api/career-os/coach-brief, displays the resulting brief
 * inline below the dashboard ring (NOT in a modal/new page per the brief).
 * Handles loading, rate-limit blocked (429), and error states.
 *
 * Phase 1 Item 2 — see docs/specs/COWORK-BRIEF-phase1-v1.md.
 */

import { useState } from "react";
import Link from "next/link";

interface CoachBriefResponse {
  brief?:       string;
  generatedAt?: string;
  source?:      "fresh" | "cache";
  plan?:        string;
  error?:       string;
  limit?:       number;
  used?:        number;
  resetsAt?:    string | null;
}

interface CoachBriefPanelProps {
  cycleId:    string;
  /** Optional initial brief if it was cached and pre-loaded by the parent */
  initial?:   { content: string; generatedAt: string } | null;
  className?: string;
}

export function CoachBriefPanel({ cycleId, initial, className }: CoachBriefPanelProps) {
  const [brief,       setBrief]       = useState<{ content: string; generatedAt: string; source: "fresh" | "cache" } | null>(
    initial ? { content: initial.content, generatedAt: initial.generatedAt, source: "cache" } : null,
  );
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<{ limit: number; used: number; resetsAt: string | null } | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setRateLimited(null);
    try {
      const res = await fetch("/api/career-os/coach-brief", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cycle_id: cycleId }),
      });
      const data = (await res.json()) as CoachBriefResponse;

      if (res.status === 429 && data.error === "rate_limited") {
        setRateLimited({
          limit:    data.limit ?? 0,
          used:     data.used ?? 0,
          resetsAt: data.resetsAt ?? null,
        });
        return;
      }
      if (!res.ok || !data.brief || !data.generatedAt) {
        setError(data.error ?? "Failed to generate brief.");
        return;
      }
      setBrief({
        content:     data.brief,
        generatedAt: data.generatedAt,
        source:      data.source ?? "fresh",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={"rounded-xl border border-gray-200 bg-white p-5 shadow-sm " + (className ?? "")}
      data-testid="coach-brief-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Coaching brief</h3>
          <p className="mt-1 text-sm text-gray-500">
            A concise read on where you are and what to do next, generated on demand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold
                     text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? "Generating your coaching brief..."
            : brief
              ? "Refresh brief"
              : "Get my coaching brief"}
        </button>
      </div>

      {rateLimited && (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="coach-brief-rate-limit"
        >
          <p>
            You have used your <strong>{rateLimited.used}</strong> of{" "}
            <strong>{rateLimited.limit}</strong> coaching briefs this month.
          </p>
          <p className="mt-1">
            <Link href="/settings/billing" className="font-semibold underline hover:text-amber-700">
              Upgrade for more
            </Link>
            {rateLimited.resetsAt && (
              <span className="ml-1 text-xs">
                — current window resets {new Date(rateLimited.resetsAt).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      )}

      {error && (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="coach-brief-error"
        >
          {error}
        </div>
      )}

      {brief && (
        <article
          className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
          data-testid="coach-brief-content"
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-gray-800">
            {brief.content}
          </pre>
          <p className="mt-3 text-xs text-gray-400">
            Generated {new Date(brief.generatedAt).toLocaleString()}
            {brief.source === "cache" && " · cached"}
          </p>
        </article>
      )}
    </section>
  );
}
