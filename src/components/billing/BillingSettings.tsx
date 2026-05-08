"use client";

import { useEffect, useState } from "react";
import { PlanBadge }  from "./PlanBadge";
import { PlanCard }   from "./PlanCard";
import { FoundingLifetime } from "./FoundingLifetime";
import {
  getSubscription,
  getBillingPortalUrl,
} from "@/services/billing/subscriptionService";
import { PLAN_ORDER } from "@/services/billing/types";
import type { UserSubscription, SubscriptionPlan, BillingCycle } from "@/services/billing/types";

const MONETIZATION_ENABLED =
  process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
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
  const isPaid  = plan !== "free";
  const isCanceled = subscription?.cancel_at_period_end;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Founding Lifetime — prominent for free users while seats remain */}
      {!isPaid && <FoundingLifetime />}

      {/* Current plan + manage billing */}
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
      </div>

      {/* Plan grid header + cycle toggle */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {MONETIZATION_ENABLED ? "Compare plans" : "Plans — coming soon"}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {MONETIZATION_ENABLED
                ? "Pick the tier that fits where you are in your career."
                : "Paid plans aren't active yet — every feature below is free during the preview period. The cards show what each tier will include at launch."}
            </p>
          </div>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              onClick={() => setCycle("monthly")}
              data-testid="cycle-toggle-monthly"
              className={`rounded px-3 py-1 transition-colors ${cycle === "monthly" ? "bg-brand-600 text-white" : "text-gray-600"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("annual")}
              data-testid="cycle-toggle-annual"
              className={`rounded px-3 py-1 transition-colors ${cycle === "annual" ? "bg-brand-600 text-white" : "text-gray-600"}`}
            >
              Annual <span className="opacity-70">(35% off)</span>
            </button>
          </div>
        </div>

        {/* Plan grid — 4 cards including Free for context */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-grid">
          {PLAN_ORDER.map((tier) => (
            <PlanCard
              key={tier}
              tier={tier}
              currentPlan={plan}
              cycle={cycle}
              monetizationEnabled={MONETIZATION_ENABLED}
            />
          ))}
        </div>

        {/* One-time add-ons footer */}
        <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Available on every tier — one-time add-ons
          </p>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>• <span className="font-semibold text-gray-700">Career Sprint</span> ($29) — 30-day intensive coaching push, AI-only at launch.</li>
            <li>• <span className="font-semibold text-gray-700">Interview Week</span> ($19) — focused interview-prep boost.</li>
            <li>• <span className="font-semibold text-gray-700">Negotiation Pack</span> ($19) — offer-negotiation toolkit and email templates.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
