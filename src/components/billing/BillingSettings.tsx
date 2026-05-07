"use client";

import { useEffect, useState } from "react";
import { PlanBadge }  from "./PlanBadge";
import { UpgradeCTA } from "./UpgradeCTA";
import { FoundingLifetime } from "./FoundingLifetime";
import {
  getSubscription,
  getBillingPortalUrl,
} from "@/services/billing/subscriptionService";
import { PLAN_LIMITS, PLAN_PRICES, PLAN_ORDER } from "@/services/billing/types";
import type { UserSubscription, SubscriptionPlan, BillingCycle } from "@/services/billing/types";

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
  const [cycle, setCycle]               = useState<BillingCycle>("monthly");
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
    );
  }

  const plan: SubscriptionPlan = subscription?.plan ?? "free";
  const status  = subscription?.status ?? "active";
  const limits  = PLAN_LIMITS[plan];
  const isPaid  = plan !== "free";
  const isCanceled = subscription?.cancel_at_period_end;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Founding Lifetime — prominent, only renders when seats remain */}
      {!isPaid && <FoundingLifetime />}

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Current plan</h3>
            <div className="mt-2 flex items-center gap-3">
              <PlanBadge plan={plan} size="lg" />
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
              <span className="text-xs text-gray-400">
                Use the portal to cancel, swap card, or download invoices.
              </span>
            </div>
          )}
        </div>

        <ul className="mt-4 border-t border-gray-100 pt-4">
          <PlanFeatureRow
            label={limits.maxCycles === -1 ? "Unlimited Career OS cycles" : `${limits.maxCycles} Career OS cycles`}
            included={true}
          />
          <PlanFeatureRow label="AI Coach (interview prep + resume)"            included={limits.aiCoach} />
          <PlanFeatureRow label="Advanced match score insights"                 included={limits.advancedMatch} />
          <PlanFeatureRow
            label={limits.coverLettersPerMonth === -1
              ? "Unlimited cover letters"
              : `${limits.coverLettersPerMonth} cover letters / month`}
            included={limits.coverLettersPerMonth !== 0}
          />
          <PlanFeatureRow label="Priority support"                              included={limits.prioritySupport} />
        </ul>
      </div>

      {/* Upgrade options */}
      {plan !== "pro" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">
              {MONETIZATION_ENABLED ? "Upgrade your plan" : "Plans — coming soon"}
            </h3>
            <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
              <button
                onClick={() => setCycle("monthly")}
                className={`rounded px-3 py-1 transition-colors ${cycle === "monthly" ? "bg-brand-600 text-white" : "text-gray-600"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCycle("annual")}
                className={`rounded px-3 py-1 transition-colors ${cycle === "annual" ? "bg-brand-600 text-white" : "text-gray-600"}`}
              >
                Annual <span className="opacity-70">(35% off)</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(["starter", "standard", "pro"] as Exclude<SubscriptionPlan, "free">[]).map((target) => (
              <UpgradeCTA
                key={target}
                targetPlan={target}
                currentPlan={plan}
                cycle={cycle}
                disabled={!MONETIZATION_ENABLED}
                variant="card"
              />
            ))}
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
                <th className="pb-2 pr-4 font-medium">Monthly</th>
                <th className="pb-2 pr-4 font-medium">Annual / mo</th>
                <th className="pb-2 pr-4 font-medium">Coach sessions</th>
                <th className="pb-2 font-medium">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLAN_ORDER.map((p) => (
                <tr key={p} className={p === plan ? "font-semibold text-gray-900" : "text-gray-600"}>
                  <td className="py-2 pr-4 capitalize">
                    {p} {p === plan && <span className="ml-1 text-xs text-brand-600">(current)</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {PLAN_PRICES[p].monthly === 0 ? "Free" : `$${PLAN_PRICES[p].monthly.toFixed(2)}/mo`}
                  </td>
                  <td className="py-2 pr-4">
                    {PLAN_PRICES[p].annualPerMonth === 0 ? "—" : `$${PLAN_PRICES[p].annualPerMonth.toFixed(2)}/mo`}
                  </td>
                  <td className="py-2 pr-4">
                    {PLAN_LIMITS[p].coachSessionsPerMonth === -1
                      ? "Unlimited"
                      : PLAN_LIMITS[p].coachSessionsPerMonth === 0
                      ? "—"
                      : PLAN_LIMITS[p].coachSessionsPerMonth}
                  </td>
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
