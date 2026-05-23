"use client";

/**
 * /design — Stage 01 Design (Sprint H2 full build).
 *
 * Replaces the Sprint H1 StageComingSoon stub. Layout:
 *
 *   StageHeader
 *
 *   ┌────────────────────────────┬────────────────────────────┐
 *   │ DesignAgent                │ JobPostingForm             │
 *   │ (plain-language → draft)   │ (structured edit + Save /  │
 *   │                            │  Publish to iCareerOS)     │
 *   └────────────────────────────┴────────────────────────────┘
 *
 *   JobPostingsList
 *
 * Auth gating: middleware (PR #284) already 307s unauthenticated
 * traffic on hire.icareeros.com/design to /auth/login. This client
 * page proceeds without an explicit auth check — same pattern as
 * the existing hire pages. The API routes also gate at 401.
 *
 * Brief: COWORK-BRIEF-hire-stage-01-design-build-v1
 * ADR:   ADR-HIRE-002 v1.1 (job_postings + opportunities mirror trigger)
 */

import { useState } from "react";
import { StageHeader } from "@/components/hire/StageHeader";
import { DesignAgent, type DesignDraft } from "@/components/hire/DesignAgent";
import { JobPostingForm, type JobPostingRecord } from "@/components/hire/JobPostingForm";
import { JobPostingsList } from "@/components/hire/JobPostingsList";

export default function HireDesignPage() {
  // Form pre-fill state — bumped by the agent's onDraftGenerated.
  const [formInitial, setFormInitial] = useState<Partial<JobPostingRecord> | undefined>(undefined);
  // List refresh ticker — bumped by the form's onSaved.
  const [refreshToken, setRefreshToken] = useState(0);

  function handleDraftGenerated(draft: DesignDraft) {
    // The agent only fills title/description/requirements/nice_to_haves.
    // Other fields stay whatever the user already entered (or empty).
    setFormInitial((prev) => ({
      ...(prev ?? {}),
      title:         draft.title,
      description:   draft.description,
      requirements:  draft.requirements,
      nice_to_haves: draft.nice_to_haves,
    }));
  }

  function handleSaved(_posting: JobPostingRecord) {
    // Trigger the list to re-fetch. No use of the saved payload here.
    setRefreshToken((n) => n + 1);
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <StageHeader stageId="design" />

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
          gap:                 "1.25rem",
          alignItems:          "stretch",
          marginBottom:        "1.5rem",
        }}
      >
        <DesignAgent onDraftGenerated={handleDraftGenerated} />
        <JobPostingForm initialValues={formInitial} onSaved={handleSaved} />
      </div>

      <JobPostingsList refreshToken={refreshToken} />
    </div>
  );
}
