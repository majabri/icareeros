"use client";

/**
 * Founding Lifetime Access — checkout shell.
 *
 * Per COWORK-BRIEF-legal-deploy-v1 Phase 4 (reconciled with Amir 2026-05-07):
 *   Build the UI + consent gating now. Payment button is a console.log stub.
 *   Stripe wiring deferred until 2026-05-31 (NEXT_PUBLIC_MONETIZATION_ENABLED=true).
 *
 * When Stripe goes live, replace the stub onPurchase() with the real Stripe
 * checkout-session call, and move recordFoundingConsent() into the post-
 * payment webhook handler (payment_intent.succeeded) so the consent_records
 * row only lands when payment actually clears.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { FoundingOfferConsent } from "@/components/legal/FoundingOfferConsent";
import { recordFoundingConsent } from "@/app/actions/consentActions";

const FOUNDING_PRICE_USD = 89.0;
const FOUNDING_SEATS_TOTAL = 1000;

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
    if (!consented) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      // TODO: wire Stripe when NEXT_PUBLIC_MONETIZATION_ENABLED=true (target: 2026-05-31)
      //   When enabled, replace the console.log + stub-success below with:
      //   1. Create a Stripe Checkout Session for the $89 one-time founding pass.
      //   2. Redirect to Stripe Checkout.
      //   3. After payment_intent.succeeded webhook, call recordFoundingConsent
      //      (move this OUT of the client and into the webhook handler so the
      //      consent_records row only lands on actual successful payment).
      console.log("[founding-offer] Stripe checkout would launch here", {
        userId,
        userEmail,
        consented,
        priceUsd: FOUNDING_PRICE_USD,
      });

      setStatusMsg(
        "Founding offer checkout is not yet enabled. Coming May 31, 2026 — you'll be able to complete this purchase then.",
      );

      // Audit-trail note: when Stripe is live, recordFoundingConsent moves
      // into the webhook handler. For now, do NOT record consent — payment
      // didn't actually happen.
    } catch (err) {
      console.error("[founding-offer] stub error:", err);
      setStatusMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Exposed for tests + future webhook handler verification:
  // calling recordFoundingConsent on a user is the right behavior post-payment.
  // We reference it here so the build keeps a real import (otherwise
  // unused imports get flagged) and so the call site is documented.
  const _stubRecordConsentRef: typeof recordFoundingConsent = recordFoundingConsent;
  void _stubRecordConsentRef;

  const buttonDisabled = !consented || loading || !userId;

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
          {loading ? "Processing…" : `Purchase Lifetime Access — $${FOUNDING_PRICE_USD.toFixed(2)}`}
        </button>
        {!userId && (
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
