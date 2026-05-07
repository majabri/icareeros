"use client";

/**
 * AcceptedCelebration — modal celebration moment shown after a user
 * accepts an offer in the Offer Desk.
 *
 * Phase 4 Item 3 — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Auto-redirects to /dashboard after 3 seconds (the new cycle's Evaluate
 * stage will be the first CTA there). Caller can override via onComplete.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CareerXpBadge } from "./CareerXpBadge";

export interface AcceptedCelebrationProps {
  totalXp:     number;
  level:       number;
  onComplete?: () => void;
  /** Auto-redirect delay in ms; 0 disables redirect (caller handles). */
  redirectMs?: number;
  redirectTo?: string;
}

export function AcceptedCelebration({
  totalXp,
  level,
  onComplete,
  redirectMs = 3_000,
  redirectTo = "/dashboard",
}: AcceptedCelebrationProps) {
  const router = useRouter();

  useEffect(() => {
    if (redirectMs <= 0) return;
    const timer = setTimeout(() => {
      onComplete?.();
      router.push(redirectTo);
    }, redirectMs);
    return () => clearTimeout(timer);
  }, [redirectMs, redirectTo, onComplete, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="accepted-celebration-modal"
    >
      <div className="max-w-md w-full rounded-2xl bg-white shadow-xl p-7 text-center">
        <div className="text-5xl" aria-hidden="true">🎉</div>
        <h2 className="mt-3 text-lg font-semibold text-gray-900">
          Congratulations — you've completed a Career OS cycle.
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Your next cycle starts now. Let's aim higher.
        </p>
        <div className="mt-5 flex items-center justify-center">
          <CareerXpBadge totalXp={totalXp} level={level} />
        </div>
        <p className="mt-4 text-[11px] text-gray-400">Redirecting to your dashboard…</p>
      </div>
    </div>
  );
}
