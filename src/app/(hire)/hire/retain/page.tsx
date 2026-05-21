import type { Metadata } from "next";
import { StageHeader } from "@/components/hire/StageHeader";
import { StageLocked } from "@/components/hire/StageLocked";

export const metadata: Metadata = { title: "Retain — iCareerOS for Hiring" };

/**
 * Stage — Retain. Stub for Sprint H1.
 *
 * Billing tier: Starter+. Free-plan employers see the locked
 * placeholder + Upgrade CTA -> /settings/billing.
 *
 * Sprint H1 simplification: StageLocked renders unconditionally on
 * this route. Full plan-aware check (read employer's plan from DB,
 * show actual stage content if Starter+) ships in H2.
 */
export default function HireRetainPage() {
  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 800, margin: "0 auto" }}>
      <StageHeader stageId="retain" />
      <StageLocked stageId="retain" />
    </div>
  );
}
