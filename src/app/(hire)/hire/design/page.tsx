import type { Metadata } from "next";
import { StageHeader } from "@/components/hire/StageHeader";
import { StageComingSoon } from "@/components/hire/StageComingSoon";

export const metadata: Metadata = { title: "Design — iCareerOS for Hiring" };

/**
 * Stage 01 — Design.
 *
 * Sprint H1: stub only. Design is billing=free but status=planned, so
 * we render StageComingSoon (informational, no Upgrade CTA) rather
 * than StageLocked. Per directive from strategy chat 2026-05-21.
 *
 * Sprint H2 will build the actual JD-builder agent + the cross-side
 * write path to the shared opportunities / job_postings store.
 */
export default function HireDesignPage() {
  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 800, margin: "0 auto" }}>
      <StageHeader stageId="design" />
      <StageComingSoon stageId="design" />
    </div>
  );
}
