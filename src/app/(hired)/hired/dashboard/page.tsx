import type { Metadata } from "next";
import { Suspense } from "react";
import { CandidateSearch } from "./CandidateSearch";

export const metadata: Metadata = { title: "Find talent — iCareerOS for Hiring" };

/**
 * Phase 2 recruiter discoverability (2026-05-17) — replaces the
 * coming-soon stub with the real candidate search interface.
 *
 * Server component shell. The interactive search + filter row + card
 * grid lives in CandidateSearch (client). Wrapped in <Suspense> so the
 * useSearchParams call inside CandidateSearch doesn't pull the whole
 * page off static rendering.
 */
export default function HiredDashboardPage() {
  return (
    <Suspense fallback={null}>
      <CandidateSearch />
    </Suspense>
  );
}
