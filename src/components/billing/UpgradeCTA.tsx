"use client";

import { useState } from "react";
import { createCheckoutSession } from "@/services/billing/subscriptionService";
import { PLAN_PRICES } from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";

interface UpgradeCTAProps {
  /** Target plan to upgrade to */
  targetPlan: "pro" | "premium";
  /** Current plan — if already on targetPlan or higher, renders null */
  currentPlan: SubscriptionPlan;
  /** When true (monetization not yet enabled) renders a disabled teaser */
  disabled?: boolean;
  variant?: "button" | "card";
  className?: string;
}

export function UpgradeCTA({
  targetPlan,
  currentPlan,
  disabled = false,
  variant = "button",
  className = "",
}: UpgradeCTAProps) {
  const [loading, setLoading] = useState(false);

  const PLAN_ORDER: SubscriptionPlan[] = ["free", "pro", "premium"];
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const targetIdx  = PLAN_ORDER.indexOf(targetPlan);

  // Already on this plan or higher — don't show
  if (currentIdx >= targetIdx) return null;

  const price    = PLAN_PRICES[targetPlan].monthly;
  const planName = targetPlan === "pro" ? "Pro" : "Premium";

  async function handleUpgrade() {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const url = await createCheckoutSession(targetPlan);
      if (url) {
        window.location.href = url;
      } else {
        // Stripe not yet configured — show informative message
        alert(
          "Billing is not yet active. Check back soon!"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (variant === "card") {
    return (
      <div
        className={`
          rounded-xl border border-gray-200 bg-white p-5 shadow-sm
          ${className}
        `}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Upgrade to</p>
            <p className="text-xl font-bold text-gray-900">{planName}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              ${price}/month
            </p>
          </div>
          {targetPlan === "premium" && (
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
              Best value
            </span>
          )}
        </div>
        <button
          onClick={handleUpgrade}
          disabled={disabled || loading}
          className={`
            mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white
            transition-colors focus-visible:outline focus-visible:outline-2
            ${
              targetPlan === "pro"
                ? "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600"
                : "bg-violet-600 hover:bg-violet-700 focus-visible:outline-violet-600"
            }
            disabled:cursor-not-allowed disabled:opacity-50
          `}
        >
          {loading ? "Redirecting…" : disabled ? "Coming soon" : `Upgrade to ${planName}`}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleUpgrade}
      disabled={disabled || loading}
      className={`
        inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold
        text-white transition-colors focus-visible:outline focus-visible:outline-2
        ${
          targetPlan === "pro"
            ? "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600"
            : "bg-violet-600 hover:bg-violet-700 focus-visible:outline-violet-600"
        }
        disabled:cursor-not-allowed disabled:opacity-50
        ${className}
      `}
    >
      {loading && (
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {loading ? "Redirecting…" : disabled ? `${planName} — coming soon` : `Upgrade to ${planName}`}
    </button>
  );
}
