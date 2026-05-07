"use client";

import { useState } from "react";
import { PLAN_PRICES, PLAN_ORDER } from "@/services/billing/types";
import type { SubscriptionPlan, BillingCycle } from "@/services/billing/types";
import { createCheckoutSession } from "@/services/billing/subscriptionService";

type PaidPlan = Exclude<SubscriptionPlan, "free">;

interface UpgradeCTAProps {
  targetPlan: PaidPlan;
  currentPlan: SubscriptionPlan;
  cycle?: BillingCycle;          // monthly default
  className?: string;
  disabled?: boolean;
  variant?: string;
}

const PLAN_LABEL: Record<PaidPlan, string> = {
  starter:  "Starter",
  standard: "Standard",
  pro:      "Pro",
};

const PLAN_DESCRIPTION: Record<PaidPlan, string> = {
  starter:
    "Unlimited cycles, AI Coach, weekly tracking, and 2 cover letters / month.",
  standard:
    "Everything in Starter plus 5 cover letters / month, 10 coach sessions, and deeper match insights.",
  pro:
    "Unlimited everything: cover letters, coach sessions, mock interviews, and priority support.",
};

export function UpgradeCTA({
  targetPlan,
  currentPlan,
  cycle = "monthly",
  className = "",
  disabled = false,
}: UpgradeCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const targetIdx  = PLAN_ORDER.indexOf(targetPlan);
  if (currentIdx >= targetIdx) return null;

  const monthly = PLAN_PRICES[targetPlan].monthly;
  const annual  = PLAN_PRICES[targetPlan].annualPerMonth;
  const price   = cycle === "annual" ? annual : monthly;
  const planName = PLAN_LABEL[targetPlan];

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession({ plan: targetPlan, cycle });
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

  const accent =
    targetPlan === "pro"
      ? "bg-amber-500 hover:bg-amber-600"
      : targetPlan === "standard"
      ? "bg-indigo-600 hover:bg-indigo-700"
      : "bg-brand-600 hover:bg-brand-700";

  return (
    <div className={`rounded-xl border-2 border-brand-200 bg-brand-50 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">{planName}</span>
            {targetPlan === "pro" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Best for career changers
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{PLAN_DESCRIPTION[targetPlan]}</p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-gray-900">
            ${price.toFixed(2)}
            <span className="text-sm font-normal text-gray-500">
              /mo{cycle === "annual" ? " (billed annually)" : ""}
            </span>
          </p>
          <button
            onClick={handleUpgrade}
            disabled={loading || disabled}
            className={`mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${accent}`}
          >
            {disabled ? "Coming soon" : loading ? "Redirecting…" : `Upgrade to ${planName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
