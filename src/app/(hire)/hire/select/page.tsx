import type { Metadata } from "next";
import { Suspense } from "react";
import { CandidateSearch } from "@/components/hire/CandidateSearch";
import { StageHeader } from "@/components/hire/StageHeader";

export const metadata: Metadata = { title: "Select — iCareerOS for Hiring" };

/**
 * Stage 02 — Select. Candidate search lives here in Sprint H1.
 *
 * The CandidateSearch component was previously hosted at /dashboard;
 * Sprint H1 migrated it here so the dashboard could become the
 * iTalentOS overview. CandidateSearch itself is unchanged — same
 * Phase 2/3 behaviour (career_profiles read, blocked_companies
 * filter, employer-profile gate).
 *
 * Wrapped in <Suspense> because CandidateSearch uses
 * useSearchParams internally — same pattern as the previous
 * dashboard host.
 */
export default function HireSelectPage() {
  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 1080, margin: "0 auto" }}>
      <StageHeader stageId="select" />
      <Suspense fallback={null}>
        <CandidateSearch />
      </Suspense>
    </div>
  );
}
