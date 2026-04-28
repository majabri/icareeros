"use client";

import { useEffect, useState } from "react";
import { PlanBadge }  from "./PlanBadge";
import { UpgradeCTA } from "./UpgradeCTA";
import {
  getSubscription,
  getBillingPortalUrl,
  cancelSubscription,
} from "@/services/billing/subscriptionService";
import { PLAN_LIMITS, PLAN_PRICES } from "@/services/billing/types";
import type { UserSubscription, SubscriptionPlan } from "@/services/billing/types";

// Read feature flag from env — set NEXT_PUBLIC_MONETIZATION_ENABLED=true when ready
const MONETIZATION_ENABLED =
  process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function PlanFeatureRow({ label, included }: { label: string; included: boolean }) {
  return (
    <li className="flex items-center gap-3 py-1.5 text-sm">
      {included ? (
        <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={included ? "text-gray-800" : "text-gray-400"}>{label}</span>
    </li>
  );
}

export function BillingSettings() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading]           = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    getSubscription()
      .then(setSubscription)
      .catch(() => setError("Failed to load subscription details."))
      .finally(() => setLoading(false));
  }, []);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const url = await getBillingPortalUrl();
      if (url) window.location.href = url;
      else setError("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelConfirm) { setCancelConfirm(true); return; }
    setCancelLoading(true);
    try {
      const ok = await cancelSubscription();
      if (ok) {
        setSubscription((prev) => prev ? { ...prev, cancel_at_period_end: true } : prev);
        setCancelConfirm(false);
      } else {
        setError("Cancellation failed. Please try again or use the billing portal.");
      }
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
    );
  }

  const plan    = subscription?.plan ?? "free";
  const status  = subscription?.status ?? "active";
  const limits  = PLAN_LIMITS[plan as SubscriptionPlan];
  const isPaid  = plan !== "free";
  const isCanceled = subscription?.cancel_at_period_end;

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Current plan</h3>
            <div className="mt-2 flex items-center gap-3">
              <PlanBadge plan={plan as SubscriptionPlan} size="lg" />
              {status === "past_due" && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  Payment past due
                </span>
              )}
              {isCanceled && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Cancels {formatDate(subscription?.current_period_end ?? null)}
                </span>
              )}
            </div>
            {isPaid && subscription?.current_period_end && !isCanceled && (
              <p className="mt-2 text-sm text-gray-500">
                Renews {formatDate(subscription.current_period_end)}
              </p>
            )}
          </div>

          {isPaid && (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {portalLoading ? "Opening…" : "Manage billing"}
              </button>
              {!isCanceled && (
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  {cancelConfirm
                    ? cancelLoading ? "Canceling…" : "Confirm cancel?"
                    : "Cancel subscription"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Plan features */}
        <ul className="mt-4 border-t border-gray-100 pt-4">
          <PlanFeatureRow
            label={limits.maxCycles === -1 ? "Unlimited Career OS cycles" : `${limits.maxCycles} Career OS cycles`}
            included={true}
          />
          <PlanFeatureRow label="AI Coach (interview prep + resume)" included={limits.aiCoach} />
          <PlanFeatureRow label="Advanced match score insights"     included={limits.advancedMatch} />
          <PlanFeatureRow label="Priority support"                  included={limits.prioritySupport} />
        </ul>
      </div>

      {/* Upgrade options — only show if not on premium and monetization will be enabled */}
      {plan !== "professional" && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-900">
            {MONETIZATION_ENABLED ? "Upgrade your plan" : "Plans — coming soon"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {plan === "free" && (
              <UpgradeCTA
                targetPlan="premium"
                currentPlan={plan as SubscriptionPlan}
                disabled={!MONETIZATION_ENABLED}
                variant="card"
              />
            )}
            <UpgradeCTA
              targetPlan="professional"
              currentPlan={plan as SubscriptionPlan}
              disabled={!MONETIZATION_ENABLED}
              variant="card"
            />
          </div>

          {!MONETIZATION_ENABLED && (
            <p className="text-xs text-gray-400">
              Paid plans are not yet active. All features are available for free during the preview period.
            </p>
          )}
        </div>
      )}

      {/* Pricing summary */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Plan comparison</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Price</th>
                <th className="pb-2 pr-4 font-medium">Cycles</th>
                <th className="pb-2 pr-4 font-medium">AI Coach</th>
                <th className="pb-2 font-medium">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(["free", "premium", "professional"] as SubscriptionPlan[]).map((p) => (
                <tr key={p} className={p === plan ? "font-semibold text-gray-900" : "text-gray-600"}>
                  <td className="py-2 pr-4 capitalize">
                    {p} {p === plan && <span className="ml-1 text-xs text-blue-600">(current)</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {PLAN_PRICES[p].monthly === 0 ? "Free" : `$${PLAN_PRICES[p].monthly}/mo`}
                  </td>
                  <td className="py-2 pr-4">
                    {PLAN_LIMITS[p].maxCycles === -1 ? "Unlimited" : PLAN_LIMITS[p].maxCycles}
                  </td>
                  <td className="py-2 pr-4">{PLAN_LIMITS[p].aiCoach ? "✓" : "—"}</td>
                  <td className="py-2">{PLAN_LIMITS[p].prioritySupport ? "Priority" : "Standard"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
