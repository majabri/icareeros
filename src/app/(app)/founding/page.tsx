"use client";

/**
 * Founding Lifetime Access — checkout page.
 *
 * Wired through createCheckoutSession({ addon: "founding_lifetime" }), which
 * resolves to STRIPE_PRICE_FOUNDING (one-time $89). The Stripe webhook
 * handler (src/app/api/stripe/webhook/route.ts) sets plan='pro' on success
 * and atomically decrements feature_flags.founding_seats_remaining.
 *
 * Gating
 * ──────
 * NEXT_PUBLIC_MONETIZATION_ENABLED guards the actual Stripe call:
 *   • off → button disabled, label "Coming soon", matches the
 *           /settings/billing FoundingLifetime banner pattern
 *   • on  → real Stripe checkout redirect
 *
 * Pre-flight requirements
 * ───────────────────────
 *   • user must be signed in (auth check via supabase.auth.getUser())
 *   • user must check the Founding Member consent box
 *   • feature_flags.founding_seats_remaining > 0 (enforced server-side
 *     in the webhook + by /api/stripe/founding-status surface)
 *
 * Consent recording
 * ─────────────────
 * Consent is recorded on click via recordFoundingConsent() — matches the
 * existing "consent at click time" pattern used by FoundingLifetime banner.
 * The Stripe webhook handles seat-counter decrement on payment_intent
 * succeeded; if payment fails, the consent record stays (acceptable —
 * we logged that the user agreed at that moment, even if checkout was
 * abandoned).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { FoundingOfferConsent } from "@/components/legal/FoundingOfferConsent";
import { recordFoundingConsent } from "@/app/actions/consentActions";
import { createCheckoutSession } from "@/services/billing/subscriptionService";

const FOUNDING_PRICE_USD = 89.0;
const FOUNDING_SEATS_TOTAL = 1000;

const MONETIZATION_ENABLED =
  process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";

export default function FoundingCheckoutPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPurchase() {
    if (!consented || !userId) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      // Record consent at click time (matches FoundingLifetime banner
      // pattern). If checkout fails later, we still have an audit row
      // showing the user agreed to the founding terms at this moment.
      await recordFoundingConsent({ userId, email: userEmail ?? undefined });

      const url = await createCheckoutSession({ addon: "founding_lifetime" });
      if (url) {
        window.location.href = url;
        return;          // intentional — we redirected
      }
      setStatusMsg(
        "Checkout is not available right now. Please try again in a moment.",
      );
    } catch (err) {
      console.error("[founding] checkout error:", err);
      setStatusMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // The button is disabled when (a) the user hasn't consented, (b) they're
  // not signed in, (c) we're in flight, OR (d) monetization is off entirely
  // (preview-only UAT or pre-launch). The label below reflects (d) explicitly
  // so users understand why the button is greyed.
  const monetizationOff = !MONETIZATION_ENABLED;
  const buttonDisabled  = !consented || loading || !userId || monetizationOff;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-700">
          Limited — first {FOUNDING_SEATS_TOTAL.toLocaleString()} members
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Founding Lifetime Access</h1>
        <p className="mt-3 text-gray-600">
          One payment of <strong>${FOUNDING_PRICE_USD.toFixed(2)} USD</strong>. Lifetime access to the iCareerOS platform —
          all six career-OS stages, AI coaching, fit analysis, and every core feature.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" aria-label="What you get">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">What you get</h2>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>✓ Unlimited Career OS cycles (Evaluate → Achieve)</li>
          <li>✓ AI Career Coach (Claude-powered, all six stages)</li>
          <li>✓ Resume builder + AI fit analysis vs. any job</li>
          <li>✓ Interview simulator + cover letter generator</li>
          <li>✓ All future core-platform features at no extra cost</li>
        </ul>
      </section>

      <FoundingOfferConsent onChange={setConsented} />

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void onPurchase()}
          disabled={buttonDisabled}
          data-testid="founding-purchase-button"
          className="w-full rounded-lg bg-amber-600 px-6 py-3 text-base font-semibold
                     text-white shadow-sm hover:bg-amber-700
                     disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500
                     focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
        >
          {monetizationOff
            ? "Coming soon"
            : loading
            ? "Processing…"
            : `Purchase Lifetime Access — $${FOUNDING_PRICE_USD.toFixed(2)}`}
        </button>
        {monetizationOff && (
          <p className="mt-2 text-center text-xs text-gray-500">
            Founding offer checkout will open when Stripe billing goes live. Your seat is not yet
            reserved — check back after the May 31, 2026 launch.
          </p>
        )}
        {!userId && !monetizationOff && (
          <p className="mt-2 text-center text-xs text-gray-500">
            Sign in to complete your purchase.
          </p>
        )}
        {statusMsg && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {statusMsg}
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Read the full{" "}
        <a href="/legal/terms#founding-offer" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
          Founding Member Terms
        </a>
        . By completing this purchase you agree to those terms.
      </p>
    </main>
  );
}
