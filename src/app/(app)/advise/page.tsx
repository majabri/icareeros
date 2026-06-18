import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AdvisePageInner } from "./AdvisePageInner";

export const metadata: Metadata = { title: "Career Advice — iCareerOS" };

export default function AdvisePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Career Advice</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 2 of Career OS. AI-recommended paths, next actions, and a realistic timeline based on your evaluation.
        </p>

        {/* 2026-06-18 (5-stage refactor) — sub-nav tabs. Coach is now a
            sub-feature of Advise; the page that handles AI coaching lives
            at /coach (unchanged). */}
        <nav className="mt-4 flex gap-1 border-b border-gray-200" aria-label="Advise sub-navigation">
          <span
            className="border-b-2 border-brand-500 px-4 py-2 text-sm font-semibold text-brand-700"
            aria-current="page"
          >
            Career Paths
          </span>
          <Link
            href="/coach"
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            AI Coach
          </Link>
        </nav>
      </header>
      <Suspense fallback={null}><AdvisePageInner /></Suspense>
    </div>
  );
}
