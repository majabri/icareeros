"use client";

/**
 * PlanCard — full per-tier card with feature checklist for /settings/billing.
 *
 * Phase 6+ — see docs/AGENT_DESIGN_PRICING_PROPOSAL_20260506_v1.2.md (Section 3).
 *
 * Replaces the upgrade-only <UpgradeCTA /> for the page-level layout. The Free
 * tier is shown alongside paid tiers for comparison context, even when the
 * user is already on Free. The current plan is visually highlighted; CTAs
 * resolve to "Current plan" / "Coming soon" / "Upgrade →" / "Downgrade via
 * portal" based on (currentPlan, monetizationEnabled, tier ordering).
 */

import { useState } from "react";
import {
  PLAN_PRICES,
  PLAN_FEATURES,
  PLAN_ORDER,
  FEATURE_GROUP_ORDER,
  type SubscriptionPlan,
  type BillingCycle,
  type PlanFeature,
  type FeatureGroup,
} from "@/services/billing/types";
import { createCheckoutSession } from "@/services/billing/subscriptionService";

const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  free:     "Free",
  starter:  "Starter",
  standard: "Standard",
  pro:      "Pro",
};

const PLAN_TAGLINE: Record<SubscriptionPlan, string> = {
  free:     "Get started",
  starter:  "Active job seeking",
  standard: "Serious career move",
  pro:      "Career transformation",
};

const PLAN_ACCENT: Record<SubscriptionPlan, { border: string; ring: string; pillBg: string; pillText: string; cta: string }> = {
  free:     { border: "border-gray-200",    ring: "ring-gray-300",    pillBg: "bg-gray-100",    pillText: "text-gray-700",    cta: "bg-gray-600 hover:bg-gray-700" },
  starter:  { border: "border-brand-200",   ring: "ring-brand-400",   pillBg: "bg-brand-100",   pillText: "text-brand-700",   cta: "bg-brand-600 hover:bg-brand-700" },
  standard: { border: "border-indigo-200",  ring: "ring-indigo-400",  pillBg: "bg-indigo-100",  pillText: "text-indigo-700",  cta: "bg-indigo-600 hover:bg-indigo-700" },
  pro:      { border: "border-amber-300",   ring: "ring-amber-400",   pillBg: "bg-amber-100",   pillText: "text-amber-800",   cta: "bg-amber-500 hover:bg-amber-600" },
};

export interface PlanCardProps {
  tier:        SubscriptionPlan;
  currentPlan: SubscriptionPlan;
  cycle:       BillingCycle;
  /** True when NEXT_PUBLIC_MONETIZATION_ENABLED is on. Off → "Coming soon". */
  monetizationEnabled: boolean;
  className?: string;
}

function groupFeatures(features: ReadonlyArray<PlanFeature>): Record<FeatureGroup, PlanFeature[]> {
  const out: Record<string, PlanFeature[]> = {};
  for (const g of FEATURE_GROUP_ORDER) out[g] = [];
  for (const f of features) (out[f.group] ?? (out[f.group] = [])).push(f);
  return out as Record<FeatureGroup, PlanFeature[]>;
}

export function PlanCard({ tier, currentPlan, cycle, monetizationEnabled, className = "" }: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const isCurrent = tier === currentPlan;
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const tierIdx    = PLAN_ORDER.indexOf(tier);
  const direction: "current" | "upgrade" | "downgrade" =
      isCurrent          ? "current"
    : tierIdx > currentIdx ? "upgrade"
    : "downgrade";

  const accent  = PLAN_ACCENT[tier];
  const price   = PLAN_PRICES[tier];
  const monthly = cycle === "annual" ? price.annualPerMonth : price.monthly;
  const grouped = groupFeatures(PLAN_FEATURES[tier]);
  const featureCount = PLAN_FEATURES[tier].length;

  async function handleUpgrade() {
    if (tier === "free") return;
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession({ plan: tier as Exclude<SubscriptionPlan, "free">, cycle });
      if (url) {
        window.location.href = url;
      } else {
        setError("Checkout is not yet available. Please try again soon.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // CTA selection ---------------------------------------------------------
  let ctaLabel: string;
  let ctaDisabled = false;
  let ctaShown = true;

  if (direction === "current") {
    ctaLabel = "Current plan";
    ctaDisabled = true;
  } else if (tier === "free") {
    // Free is never an upgrade target — only shown for context. If the user is
    // on a paid tier and looking at the Free card, treat as informational.
    ctaLabel = "Free forever";
    ctaDisabled = true;
  } else if (!monetizationEnabled) {
    ctaLabel = "Coming soon";
    ctaDisabled = true;
  } else if (direction === "downgrade") {
    ctaLabel = "Manage in portal";
    ctaDisabled = false;
    // Click handler defaults to upgrade flow; portal redirect is handled
    // separately in BillingSettings via the "Manage billing" button. We
    // surface a hint under the CTA when this branch is hit.
  } else {
    ctaLabel = `Upgrade to ${PLAN_LABEL[tier]}`;
  }

  if (tier === "free" && currentPlan === "free") {
    // User is on free, looking at free card — mark current explicitly
    ctaLabel = "Current plan";
    ctaDisabled = true;
  }

  // Visual --------------------------------------------------------------
  const ringClass = isCurrent
    ? `ring-2 ${accent.ring} ring-offset-2`
    : "";

  return (
    <div
      data-testid={`plan-card-${tier}`}
      className={
        `relative flex flex-col rounded-2xl border-2 ${accent.border} bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${ringClass} ${className}`
      }
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{PLAN_LABEL[tier]}</h3>
            {isCurrent && (
              <span className={`rounded-full ${accent.pillBg} px-2 py-0.5 text-xs font-semibold ${accent.pillText}`}>
                Current
              </span>
            )}
            {tier === "pro" && !isCurrent && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Best value
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{PLAN_TAGLINE[tier]}</p>
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        {tier === "free" ? (
          <p className="text-3xl font-bold text-gray-900">
            $0<span className="ml-1 text-sm font-normal text-gray-500">forever</span>
          </p>
        ) : (
          <>
            <p className="text-3xl font-bold text-gray-900">
              ${monthly.toFixed(2)}
              <span className="ml-1 text-sm font-normal text-gray-500">/mo</span>
            </p>
            {cycle === "annual" && (
              <p className="mt-0.5 text-xs text-gray-500">
                Billed ${price.annualTotal.toFixed(2)} annually (35% off)
              </p>
            )}
          </>
        )}
      </div>

      {/* CTA */}
      {ctaShown && (
        <button
          type="button"
          onClick={() => void handleUpgrade()}
          disabled={loading || ctaDisabled}
          data-testid={`plan-cta-${tier}`}
          className={
            ctaDisabled
              ? "mb-4 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500 cursor-not-allowed"
              : `mb-4 w-full rounded-lg ${accent.cta} px-4 py-2 text-sm font-semibold text-white transition-colors`
          }
        >
          {loading ? "Redirecting…" : ctaLabel}
        </button>
      )}

      {error && (
        <p className="mb-3 text-xs text-red-600">{error}</p>
      )}

      {/* Feature list (grouped) */}
      <div className="space-y-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {featureCount} features included
        </p>
        {FEATURE_GROUP_ORDER.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold text-gray-700">{group}</p>
              <ul className="space-y-1">
                {items.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {f.comingSoon ? (
                      <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                        🔜 Soon
                      </span>
                    ) : (
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className="text-xs text-gray-700 leading-snug">{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
