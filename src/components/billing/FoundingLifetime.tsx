"use client";

import { useEffect, useState } from "react";
import { ADDON_PRICES } from "@/services/billing/types";
import {
  createCheckoutSession,
  getFoundingStatus,
} from "@/services/billing/subscriptionService";

const MONETIZATION_ENABLED =
  process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";

/**
 * Founding Lifetime offer banner. Hides itself when seats are sold out
 * or the feature flag is disabled. Renders prominently on the billing page.
 */
export function FoundingLifetime() {
  const [seats,   setSeats]   = useState<number | null>(null);
  const [available, setAvail] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFoundingStatus().then((s) => {
      if (cancelled) return;
      setSeats(s.seatsRemaining);
      setAvail(s.available);
    });
    return () => { cancelled = true; };
  }, []);

  if (seats === null) return null;
  if (!available) return null;

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession({ addon: "founding_lifetime" });
      if (url) window.location.href = url;
      else setError("Checkout is not yet available. Please try again soon.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const addon = ADDON_PRICES.founding_lifetime;
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-gray-900">{addon.label}</span>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              {seats} seat{seats === 1 ? "" : "s"} left
            </span>
          </div>
          <p className="text-sm text-gray-700">{addon.description}</p>
          <p className="mt-1 text-xs text-amber-800">
            One payment, Pro for life. Locks in current pricing — never increases.
          </p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-gray-900">
            ${addon.amount}
            <span className="ml-1 text-sm font-normal text-gray-500">one-time</span>
          </p>
          <button
            onClick={handleClick}
            disabled={loading || !MONETIZATION_ENABLED}
            className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {!MONETIZATION_ENABLED
              ? "Coming soon"
              : loading
              ? "Redirecting…"
              : "Claim a seat"}
          </button>
        </div>
      </div>
    </div>
  );
}
