"use client";

import { useState } from "react";
import { PLAN_PRICES } from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";
import { createCheckoutSession } from "@/services/billing/subscriptionService";

interface UpgradeCTAProps {
  targetPlan: "premium" | "professional";
  currentPlan: SubscriptionPlan;
  className?: string;
  disabled?: boolean;
  variant?: string;  // reserved for future styling variants
}

const PLAN_ORDER: SubscriptionPlan[] = ["free", "premium", "professional"];

export function UpgradeCTA({ targetPlan, currentPlan, className = "", disabled = false }: UpgradeCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const targetIdx  = PLAN_ORDER.indexOf(targetPlan);

  // Don't render if user is already on this plan or higher
  if (currentIdx >= targetIdx) return null;

  const price    = PLAN_PRICES[targetPlan].monthly;
  const planName = targetPlan === "premium" ? "Premium" : "Professional";

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession(targetPlan);
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

  return (
    <div className={`rounded-xl border-2 border-brand-200 bg-brand-50 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">{planName}</span>
            {targetPlan === "professional" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Best for career changers
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {targetPlan === "premium"
              ? "Unlimited AI coaching, 2 cover letters/mo, weekly tracking, and interview prep."
              : "Dedicated coaching dashboard, 5 cover letters/mo, unlimited mock interviews, 3–5 year roadmap, and priority support."}
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-gray-900">${price}<span className="text-sm font-normal text-gray-500">/mo</span></p>
          <button
            onClick={handleUpgrade}
            disabled={loading || disabled}
            className={`mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50
              ${targetPlan === "professional"
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-brand-600 hover:bg-brand-700"}`}
          >
            {disabled ? "Coming soon" : loading ? "Redirecting…" : `Upgrade to ${planName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
